import type { TrialEnvironment } from './auth';
import { ToolError } from './client-items';

type Input = { columnSourceId: string; fromDate?: string; toDate?: string; timeZone: string; limit: number; offset: number };
export async function deckReport(env: TrialEnvironment, input: Input) {
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: input.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { throw new ToolError('Use a valid IANA time zone, such as America/New_York.'); }
  const localDate = (value: Date) => {
    const parts = formatter.formatToParts(value);
    return ['year','month','day'].map(type => parts.find(part => part.type === type)!.value).join('-');
  };
  const today = localDate(new Date());
  const fromDate = input.fromDate || today.slice(0, 7) + '-01';
  const next = new Date(fromDate + 'T00:00:00Z'); next.setUTCMonth(next.getUTCMonth() + 1, 1);
  const toDate = input.toDate || next.toISOString().slice(0, 10);
  if (Boolean(input.fromDate) !== Boolean(input.toDate)) throw new ToolError('Provide both fromDate and toDate, or omit both for this month.');
  if (fromDate >= toDate) throw new ToolError('toDate must be after fromDate (exclusive).');
  const column = await env.TG_DATA.prepare('SELECT c.source_id AS id,COALESCE(o.name,c.name) AS name FROM production_columns c LEFT JOIN production_column_overrides o ON o.column_source_id=c.source_id WHERE c.source_id=?').bind(input.columnSourceId).first();
  if (!column) throw new ToolError('Column not found. Resolve its ID with list_deck_columns.');
  // Broaden UTC bounds one day on either side, then apply the exact local dates.
  const lower = new Date(Date.parse(fromDate) - 86400000).toISOString();
  const upper = new Date(Date.parse(toDate) + 86400000).toISOString();
  const rows = await env.TG_DATA.prepare(`SELECT e.id,e.card_source_id AS sourceId,e.changed_at AS movedAt,e.actor,e.before_json AS beforeJson,e.after_json AS afterJson,
    p.id AS cardId,COALESCE(o.title,p.title) AS title,o.deleted_at AS deletedAt
    FROM production_card_edit_log e LEFT JOIN production_cards p ON p.source_id=e.card_source_id
    LEFT JOIN production_card_overrides o ON o.card_source_id=e.card_source_id
    WHERE e.changed_at>=? AND e.changed_at<? ORDER BY e.changed_at DESC,e.id`).bind(lower, upper).all<{ id: string; sourceId: string; movedAt: string; actor: string; beforeJson: string; afterJson: string; cardId: string | null; title: string | null; deletedAt: string | null }>();
  let malformedRecords = 0;
  const events = rows.results.flatMap(row => {
    try {
      const before = JSON.parse(row.beforeJson), after = JSON.parse(row.afterJson);
      if (!after?.columnSourceId || after.columnSourceId !== input.columnSourceId || !before?.columnSourceId || before.columnSourceId === after.columnSourceId) return [];
      const date = localDate(new Date(row.movedAt));
      if (date < fromDate || date >= toDate) return [];
      return [{ id: row.id, sourceId: row.sourceId, cardId: row.cardId, title: row.title, movedAt: row.movedAt, localDate: date, actor: row.actor, fromColumnId: before.columnSourceId, deleted: Boolean(row.deletedAt) }];
    } catch { malformedRecords++; return []; }
  });
  const coverage = await env.TG_DATA.prepare('SELECT MIN(changed_at) AS earliestRecordedEdit FROM production_card_edit_log').first();
  return { column, fromDate, toDateExclusive: toDate, timeZone: input.timeZone, moveCount: events.length, uniqueCardCount: new Set(events.map(e => e.sourceId)).size,
    events: events.slice(input.offset, input.offset + input.limit), nextOffset: input.offset + input.limit < events.length ? input.offset + input.limit : null,
    coverage, malformedRecords, caveat: 'Counts recorded local card edits with both previous and new columns. Excludes initial card creation, reordering within a column, and imported history without structured transitions. Includes cards later deleted; titles are current titles.' };
}
