// Atomic append preserves dates added by another team member between reads.
export const mergedFilmingDatesSql = `(SELECT COALESCE(json_group_array(value), '[]') FROM (
 SELECT DISTINCT value FROM json_each(CASE WHEN json_valid(production_card_signals.filming_on) THEN production_card_signals.filming_on ELSE json_array(production_card_signals.filming_on) END)
 WHERE value <> '' UNION SELECT value FROM json_each(excluded.filming_on) ORDER BY value
))`;
