export function validFilmingDate(date: string): boolean {
 return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
}
function commentText(node: unknown): string {
 if (typeof node === 'string') return node;
 if (Array.isArray(node)) return node.map(commentText).join('\n');
 if (!node || typeof node !== 'object') return '';
 const item = node as { text?: unknown; children?: unknown };
 return typeof item.text === 'string' ? item.text : Array.isArray(item.children) ? item.children.map(commentText).join('') : '';
}
export function suggestCommentDates(value: unknown, now = new Date()): string[] {
 const text = commentText(value);
 const year = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year:'numeric' }).format(now);
 const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const pattern = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)\b/gi;
 return [...new Set([...text.matchAll(pattern)].map(match => {
  let date = match[0];
  if (date.includes('/')) {
   const [month, day, inputYear = year] = date.split('/');
   if (inputYear.length !== 2 && inputYear.length !== 4) return '';
   date = `${inputYear.length === 2 ? '20'+inputYear : inputYear}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
  } else if (!/^\d{4}-/.test(date)) {
   const parts = date.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i)!;
   date = `${parts[3] || year}-${String(months.indexOf(parts[1].slice(0,3).toLowerCase())+1).padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
  }
  return validFilmingDate(date) ? date : '';
 }).filter(Boolean))].slice(0,8);
}
export function suggestFilmingDate(value: unknown): string | null {
 const text = commentText(value);
 if (!/\b(?:filming|shoot(?:ing)?)\b/i.test(text) || /\b(?:not|cancelled|canceled|maybe|tentative|possibly|proposed)\b|\?/i.test(text)) return null;
 const dates = suggestCommentDates(value); return dates.length === 1 ? dates[0] : null;
}
