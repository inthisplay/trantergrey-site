import { validFilmingDates } from '../../../../../lib/filming-dates';
import { mergedFilmingDatesSql } from '../../../../_lib/filming-dates';
import { adminResponse, type AdminEnvironment } from '../../../../_lib/admin';
export async function onRequestPatch({ request, env, params }: { request: Request; env: AdminEnvironment; params: { id: string } }) {
 const denied = await adminResponse(request, env); if (denied) return denied;
 const fail = (error: string, status = 400) => Response.json({ error }, { status });
 if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return fail('Invalid request origin.', 403);
 const body = await request.json().catch(() => null);
 if (body?.filmingDates !== undefined && !validFilmingDates(body.filmingDates)) return fail('Choose valid filming dates.');
 if (body?.appendFilmingDates !== undefined && typeof body.appendFilmingDates !== 'boolean') return fail('Invalid filming date action.');
 if (!body || typeof body.attention !== 'string' || body.attention.trim().length > 80 || (body.filmingDates === undefined && typeof body.filmingOn !== 'string') || (body.dismissRecent !== undefined && typeof body.dismissRecent !== 'boolean')) return fail('Use an update of up to 80 characters and a filming date.');
 if (body.filmingOn !== undefined && typeof body.filmingOn !== 'string') return fail('Choose a valid filming date.');
 if (body.filmingOn && (!/^\d{4}-\d{2}-\d{2}$/.test(body.filmingOn) || !Number.isFinite(Date.parse(body.filmingOn)) || new Date(body.filmingOn).toISOString().slice(0,10) !== body.filmingOn)) return fail('Choose a valid filming date.');
 const card = await env.TG_DATA.prepare(`SELECT p.source_id FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE p.id=? AND o.deleted_at IS NULL`).bind(params.id).first<{source_id:string}>();
 if (!card) return fail('Card not found.', 404);
 await env.TG_DATA.prepare(`INSERT INTO production_card_signals(card_source_id,attention,filming_on,dismissed_at) VALUES(?,?,?,?) ON CONFLICT(card_source_id) DO UPDATE SET attention=excluded.attention,filming_on=${body.appendFilmingDates ? mergedFilmingDatesSql : 'excluded.filming_on'},dismissed_at=CASE WHEN ? THEN excluded.dismissed_at ELSE production_card_signals.dismissed_at END`).bind(card.source_id, body.attention.trim(), body.filmingDates !== undefined ? JSON.stringify([...new Set(body.filmingDates)].sort()) : body.appendFilmingDates ? JSON.stringify(body.filmingOn ? [body.filmingOn] : []) : body.filmingOn, body.dismissRecent ? new Date().toISOString() : '', body.dismissRecent ? 1 : 0).run();
 return Response.json({ ok:true });
}
