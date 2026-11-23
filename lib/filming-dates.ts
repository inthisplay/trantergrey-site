import { validFilmingDate } from './comment-signal';

// Read legacy single dates as well as the new JSON list in the existing field.
export function filmingDates(value: unknown): string[] {
 let dates = value;
 if (typeof value === 'string') {
  try { dates = JSON.parse(value); } catch { dates = value ? [value] : []; }
 }
 return Array.isArray(dates) ? [...new Set(dates.filter((date): date is string => typeof date === 'string' && validFilmingDate(date)))].sort() : [];
}
export function validFilmingDates(value: unknown): value is string[] {
 return Array.isArray(value) && value.length <= 100 && value.every(date => typeof date === 'string' && validFilmingDate(date));
}
