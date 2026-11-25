import type { AdminEnvironment } from './admin';
export class CardConflict extends Error {
  status = 409;
  constructor() { super('This card changed. Your draft is preserved; reload the latest card before saving again.'); }
}
export const cardVersionSql = "COALESCE(o.edited_at, p.updated_at, p.created_at, '')";
export function cardGuard(env: AdminEnvironment, id: string, expected: string) {
  return env.TG_DATA.prepare(`SELECT CASE WHEN EXISTS (
    SELECT 1 FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id
    WHERE p.id=? AND o.deleted_at IS NULL AND ${cardVersionSql}=?
  ) THEN 1 ELSE json('card_conflict') END`).bind(id, expected);
}
export async function cardBatch(env: AdminEnvironment, statements: Parameters<AdminEnvironment['TG_DATA']['batch']>[0]) {
  try { await env.TG_DATA.batch(statements); }
  catch (error) {
    if (error instanceof Error && /malformed JSON/i.test(error.message)) throw new CardConflict();
    throw error;
  }
}
