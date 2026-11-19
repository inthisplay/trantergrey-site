import { adminResponse, adminSession, type AdminEnvironment } from '../../_lib/admin';
import { readMuxBrowseAssetsById } from '../../_lib/mux-library';
import { readVideoProjectStore } from '../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };
type Row = Record<string, any>;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const fail = (error: string, status = 400) => json({ error }, status);
function media(row: Row) { return { id: row.id, personId: row.person_id, title: row.title, kind: row.kind, contentType: row.content_type, url: row.kind === 'mux' ? row.player_url : `/api/admin/rolodex/media/${row.id}`, thumbnailUrl: row.thumbnail_url, sourceCardId: row.source_card_id }; }
function person(row: Row, cover: Row | undefined) { return { id: row.id, name: row.name, birthday: row.birthday, ethnicity: row.ethnicity, gender: row.gender, tags: JSON.parse(row.tags_json), email: row.email, phone: row.phone, notes: row.notes, coverMediaId: row.cover_media_id, archivedAt: row.archived_at, cover: cover ? media(cover) : null }; }
function fields(body: Row) {
  const result: Row = {};
  for (const [key, limit] of Object.entries({ name: 180, ethnicity: 100, gender: 100, email: 254, phone: 100, notes: 10000 })) {
    if (!(key in body)) continue;
    if (typeof body[key] !== 'string' || body[key].trim().length > limit || (key === 'name' && !body[key].trim())) throw new Error(`Enter a valid ${key} (${limit} characters maximum).`);
    result[key] = body[key].trim();
  }
  if ('birthday' in body) {
    const value = body.birthday;
    if (value && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value || value > new Date().toISOString().slice(0,10) || value < '1900-01-01')) throw new Error('Enter a valid birthday, not in the future.');
    result.birthday = value || null;
  }
  if ('tags' in body) {
    if (!Array.isArray(body.tags) || body.tags.length > 40 || body.tags.some((tag: unknown) => typeof tag !== 'string' || tag.trim().length > 50)) throw new Error('Use up to 40 tags, each 50 characters or fewer.');
    result.tags_json = JSON.stringify([...new Set(body.tags.map((tag: string) => tag.trim().toLowerCase()).filter(Boolean))]);
  }
  return result;
}
export async function onRequest({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  if (request.method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return fail('Invalid request origin.', 403);
  const url = new URL(request.url);
  const db = env.TG_DATA;
  if (request.method === 'GET') {
    const id = url.searchParams.get('id');
    if (id) {
      const row = await db.prepare('SELECT * FROM rolodex_people WHERE id=? AND deleted_at IS NULL').bind(id).first<Row>();
      if (!row) return fail('Person not found.', 404);
      const { results } = await db.prepare('SELECT * FROM rolodex_media WHERE person_id=? AND deleted_at IS NULL ORDER BY created_at DESC, id').bind(id).all<Row>();
      const history = await db.prepare(`SELECT p.id AS cardId, COALESCE(o.title,p.title) AS title, g.tags_json, g.approved_at AS approvedAt FROM production_gallery g JOIN production_cards p ON p.source_id=g.card_source_id LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE g.rolodex_person_id=? AND g.deleted_at IS NULL AND o.deleted_at IS NULL ORDER BY g.created_at DESC`).bind(id).all<Row>();
      return json({ person: person(row, results.find(m => m.id === row.cover_media_id) || results.find(m => m.kind === 'upload')), media: results.map(media), history: history.results.map(({ tags_json, ...r }) => ({ ...r, tags: JSON.parse(tags_json) })) });
    }
    const rows = await db.prepare('SELECT * FROM rolodex_people WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE,id').all<Row>();
    const covers = await db.prepare('SELECT m.* FROM rolodex_media m JOIN rolodex_people p ON p.cover_media_id=m.id WHERE m.deleted_at IS NULL AND p.deleted_at IS NULL').all<Row>();
    return json({ people: rows.results.map(row => person(row, covers.results.find(m => m.id === row.cover_media_id))) });
  }
  if (request.method !== 'POST') return fail('Method not allowed.', 405);
  const body = await request.json().catch(() => null) as Row | null;
  if (!body || typeof body.action !== 'string') return fail('Choose an action.');
  const now = new Date().toISOString();
  const actor = (await adminSession(request, env))!;
  if (body.action === 'addToCard') {
    if (!Array.isArray(body.personIds) || !body.personIds.length || body.personIds.length > 100 || body.personIds.some((id: unknown) => typeof id !== 'string') || typeof body.cardId !== 'string') return fail('Choose up to 100 people and a card.');
    const card = await db.prepare(`SELECT p.source_id FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE p.id=? AND o.deleted_at IS NULL AND COALESCE(o.archived,p.archived)=0`).bind(body.cardId).first<Row>();
    if (!card) return fail('Active card not found.',404);
    let added = 0, existing = 0, unavailable = 0;
    for (const id of new Set<string>(body.personIds)) {
      const p = await db.prepare('SELECT * FROM rolodex_people WHERE id=? AND deleted_at IS NULL AND archived_at IS NULL').bind(id).first<Row>();
      if (!p) { unavailable++; continue; }
      const found = await db.prepare('SELECT id FROM production_gallery WHERE card_source_id=? AND rolodex_person_id=? AND deleted_at IS NULL').bind(card.source_id,id).first();
      if (found) { existing++; continue; }
      const m = await db.prepare(`SELECT * FROM rolodex_media WHERE person_id=? AND deleted_at IS NULL AND kind='upload' ORDER BY (id=?) DESC,created_at LIMIT 1`).bind(id,p.cover_media_id).first<Row>();
      if (!m) { unavailable++; continue; }
      const newId = crypto.randomUUID();
      await db.prepare(`INSERT OR IGNORE INTO production_gallery(id,card_source_id,filename,content_type,byte_size,r2_key,title,uploaded_by,created_at,updated_at,rolodex_person_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(newId,card.source_id,m.filename,m.content_type,m.byte_size,m.r2_key,p.name,actor.email || actor.name,now,now,id).run();
      const inserted = await db.prepare('SELECT id FROM production_gallery WHERE id=?').bind(newId).first();
      if (inserted) added++; else existing++;
    }
    return json({ added, existing, unavailable });
  }
  if (body.action === 'create' || body.action === 'fromCasting') {
    let source: Row | null = null;
    if (body.action === 'fromCasting') {
      if (typeof body.galleryId !== 'string' || typeof body.cardId !== 'string') return fail('Choose Casting media.');
      source = await db.prepare(`SELECT g.* FROM production_gallery g JOIN production_cards p ON p.source_id=g.card_source_id LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE g.id=? AND p.id=? AND g.deleted_at IS NULL AND o.deleted_at IS NULL`).bind(body.galleryId,body.cardId).first<Row>();
      if (!source) return fail('Casting media not found.',404);
      if (source.rolodex_person_id) {
        const linked = await db.prepare('SELECT id FROM rolodex_people WHERE id=? AND deleted_at IS NULL').bind(source.rolodex_person_id).first<Row>();
        if (linked) return json({ id: linked.id, alreadyLinked: true });
      }
    }
    if (body.personId && typeof body.personId !== 'string') return fail('Choose a person.');
    if (source) {
      const saved = await db.prepare('SELECT p.id FROM rolodex_media m JOIN rolodex_people p ON p.id=m.person_id WHERE m.source_gallery_id=? AND m.deleted_at IS NULL AND p.deleted_at IS NULL LIMIT 1').bind(source.id).first<Row>();
      if (saved) return json({ id: saved.id, alreadyLinked: true });
    }
    const id = body.personId || crypto.randomUUID();
    const statements = [];
    if (body.personId) {
      const p = await db.prepare('SELECT id FROM rolodex_people WHERE id=? AND deleted_at IS NULL AND archived_at IS NULL').bind(id).first();
      if (!p) return fail('Active person not found.',404);
    } else {
      let data; try { data = fields({ name: body.name }); } catch (e) { return fail((e as Error).message); }
      statements.push(db.prepare('INSERT INTO rolodex_people(id,name,created_at,updated_at) VALUES(?,?,?,?)').bind(id,data.name,now,now));
    }
    if (source) {
      const mediaId = crypto.randomUUID();
      statements.push(db.prepare(`INSERT OR IGNORE INTO rolodex_media(id,person_id,title,kind,filename,content_type,byte_size,r2_key,source_gallery_id,source_card_id,created_at) VALUES(?,?,?,'upload',?,?,?,?,?,?,?)`).bind(mediaId,id,source.title,source.filename,source.content_type,source.byte_size,source.r2_key,source.id,body.cardId,now));
      statements.push(db.prepare('UPDATE rolodex_people SET cover_media_id=COALESCE(cover_media_id,?),updated_at=? WHERE id=?').bind(mediaId,now,id));
      // A person can have several auditions on one card. Only the first gets the
      // card-level link; every saved media record retains its original source.
      statements.push(db.prepare(`UPDATE production_gallery SET rolodex_person_id=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM production_gallery WHERE card_source_id=? AND rolodex_person_id=? AND deleted_at IS NULL AND id<>?)`).bind(id,source.id,source.card_source_id,id,source.id));
    }
    await db.batch(statements);
    return json({ id },201);
  }
  if (typeof body.id !== 'string') return fail('Choose a person.');
  const p = await db.prepare('SELECT * FROM rolodex_people WHERE id=? AND deleted_at IS NULL').bind(body.id).first<Row>();
  if (!p) return fail('Person not found.',404);
  if (body.action === 'update') {
    let data; try { data = fields(body); } catch (e) { return fail((e as Error).message); }
    if (!Object.keys(data).length) return fail('No changes supplied.');
    await db.prepare(`UPDATE rolodex_people SET ${Object.keys(data).map(k => `${k}=?`).join(',')},updated_at=? WHERE id=?`).bind(...Object.values(data),now,p.id).run();
  } else if (body.action === 'archive') {
    if (typeof body.archived !== 'boolean') return fail('Invalid archive status.');
    await db.prepare('UPDATE rolodex_people SET archived_at=?,updated_at=? WHERE id=?').bind(body.archived ? now : null,now,p.id).run();
  } else if (body.action === 'delete') {
    await db.prepare('UPDATE rolodex_people SET deleted_at=?,updated_at=? WHERE id=?').bind(now,now,p.id).run();
  } else if (['cover','removeMedia','renameMedia'].includes(body.action)) {
    if (typeof body.mediaId !== 'string') return fail('Choose media.');
    const m = await db.prepare('SELECT * FROM rolodex_media WHERE id=? AND person_id=? AND deleted_at IS NULL').bind(body.mediaId,p.id).first<Row>();
    if (!m) return fail('Media not found.',404);
    if (body.action === 'cover') {
      if (m.kind !== 'upload') return fail('Choose an uploaded photo or video as the cover.');
      await db.prepare('UPDATE rolodex_people SET cover_media_id=?,updated_at=? WHERE id=?').bind(m.id,now,p.id).run();
    } else if (body.action === 'renameMedia') {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 180) return fail('Enter a media title (up to 180 characters).');
      await db.prepare('UPDATE rolodex_media SET title=? WHERE id=?').bind(body.title.trim(),m.id).run();
    } else {
      await db.batch([db.prepare('UPDATE rolodex_media SET deleted_at=? WHERE id=?').bind(now,m.id), db.prepare(`UPDATE rolodex_people SET cover_media_id=(SELECT id FROM rolodex_media WHERE person_id=? AND deleted_at IS NULL AND kind='upload' ORDER BY created_at LIMIT 1),updated_at=? WHERE id=? AND cover_media_id=?`).bind(p.id,now,p.id,m.id)]);
    }
  } else if (body.action === 'mux') {
    if (typeof body.assetId !== 'string') return fail('Choose a Mux video.');
    const [asset] = await readMuxBrowseAssetsById(env,[body.assetId]);
    if (!asset?.playerUrl) return fail('Playable Mux video not found.',404);
    const store = await readVideoProjectStore(env);
    const project = store.projects.find(project => project.variants.some(variant => variant.assetId === asset.id));
    await db.prepare(`INSERT OR IGNORE INTO rolodex_media(id,person_id,title,kind,mux_asset_id,player_url,thumbnail_url,created_at) VALUES(?,?,?,'mux',?,?,?,?)`).bind(crypto.randomUUID(),p.id,project?.title || asset.title,asset.id,asset.playerUrl,asset.thumbnailUrl,now).run();
  } else return fail('Unknown action.');
  return json({ ok: true });
}
