import type { AdminEnvironment } from './admin';

export type SnapshotCard = { id: number | string; title: string; position?: number | null; content?: string | null; description?: string | null; status?: string; created_at?: string | null; updated_at?: string | null; due_on?: string | null; completed_at?: string | null; completer?: unknown; assignees?: unknown[]; parent?: { id?: number | string }; completed?: boolean };
export type SnapshotColumn = { id: number | string; title: string; position?: number | null; type?: string; cards?: SnapshotCard[] };
export type ProductionSnapshot = { sourceBoardId: number | string; importedAt?: string; columns: SnapshotColumn[]; archivedCards?: SnapshotCard[] };

export async function importProductionSnapshot(env: AdminEnvironment, snapshot: ProductionSnapshot) {
  if (!Array.isArray(snapshot.columns) || !snapshot.columns.length) throw new Error('A snapshot needs at least one column.');
  const importedAt = snapshot.importedAt || new Date().toISOString();
  const importId = crypto.randomUUID(); const boardId = String(snapshot.sourceBoardId);
  const cards = [...snapshot.columns.flatMap(column => (column.cards || []).map(card => ({ card, columnId: column.id, archived: false }))), ...(snapshot.archivedCards || []).map(card => ({ card, columnId: card.parent?.id, archived: true }))];
  await env.TG_DATA.prepare('INSERT INTO production_imports (id, source_board_id, started_at, status, source_counts, imported_counts) VALUES (?, ?, ?, ?, ?, ?)').bind(importId, boardId, importedAt, 'running', JSON.stringify({ columns: snapshot.columns.length, cards: cards.length }), '{}').run();
  try {
    const statements = [
      ...snapshot.columns.map(column => env.TG_DATA.prepare(`INSERT INTO production_columns (source_id, name, position, column_type, imported_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET name=excluded.name, position=excluded.position, column_type=excluded.column_type, imported_at=excluded.imported_at`).bind(String(column.id), column.title, column.position ?? null, column.type ?? null, importedAt)),
      ...cards.filter(({ columnId }) => columnId !== undefined).map(({ card, columnId, archived }) => env.TG_DATA.prepare(`INSERT INTO production_cards (id, source_id, column_source_id, position, title, description_html, archived, assignees_json, created_at, updated_at, due_on, completed_at, completion_author_json, source_json, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET column_source_id=excluded.column_source_id, position=excluded.position, title=excluded.title, description_html=excluded.description_html, archived=excluded.archived, assignees_json=excluded.assignees_json, updated_at=excluded.updated_at, due_on=excluded.due_on, completed_at=excluded.completed_at, completion_author_json=excluded.completion_author_json, source_json=excluded.source_json, imported_at=excluded.imported_at`).bind(`bc-card-${card.id}`, String(card.id), String(columnId), card.position ?? null, card.title, card.description ?? card.content ?? null, archived || card.status === 'archived' ? 1 : 0, JSON.stringify(card.assignees || []), card.created_at ?? null, card.updated_at ?? null, card.due_on ?? null, card.completed_at ?? null, JSON.stringify(card.completer || null), JSON.stringify(card), importedAt)),
    ];
    await env.TG_DATA.batch(statements);
    await env.TG_DATA.prepare('UPDATE production_imports SET completed_at = ?, status = ?, imported_counts = ? WHERE id = ?').bind(new Date().toISOString(), 'complete', JSON.stringify({ columns: snapshot.columns.length, cards: cards.length }), importId).run();
    return { importId, columns: snapshot.columns.length, cards: cards.length };
  } catch (error) {
    await env.TG_DATA.prepare('UPDATE production_imports SET completed_at = ?, status = ?, notes = ? WHERE id = ?').bind(new Date().toISOString(), 'failed', JSON.stringify([error instanceof Error ? error.message : 'Unknown import failure']), importId).run(); throw error;
  }
}
