import { filmingDates } from './filming-dates';
export type CardSignalFields = { openQuestion?: string | null; attention?: string | null; filmingOn?: string | null; dismissedAt?: string | null; muxAddedAt?: string | null; galleryAddedAt?: string | null; archived?: number; completedAt?: string | null };
export function cardSignal(card: CardSignalFields, now = new Date()) {
  if (card.archived || card.completedAt) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const upcoming = filmingDates(card.filmingOn).filter(date => date >= today);
  const filming = upcoming[0] || '';
  const days = (Date.parse(filming + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000;
  const dateSignal = days >= 0 && days <= 14 ? { kind: 'date', label: `Filming ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(filming.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' as const } : {}) }).format(new Date(filming + 'T12:00:00Z'))}${upcoming.length > 1 ? ` +${upcoming.length - 1}` : ''}`, target: 'card-comments' } : null;
  if (dateSignal && days <= 2) return dateSignal;
  if (card.attention?.trim()) return { kind: 'attention', label: card.attention, target: 'card-comments' };
  if (card.openQuestion) {
    try {
      const question = JSON.parse(card.openQuestion);
      if (typeof question.id === 'string' && typeof question.author === 'string') {
        const name = question.author.trim().split(/\s+/)[0] || 'Someone';
        return { kind: 'attention', label: `${name} asked a question`, target: `comment-local-${question.id}` };
      }
    } catch { /* Ignore malformed summary data. */ }
  }
  if (dateSignal) return dateSignal;
  const additions = [{ at: card.muxAddedAt, label: 'Mux asset added', target: 'card-comments' }, { at: card.galleryAddedAt, label: 'Casting options added', target: 'card-gallery' }]
    .filter(item => item.at && Date.parse(item.at) > (Date.parse(card.dismissedAt || '') || 0) && now.getTime() - Date.parse(item.at) <= 7 * 86400000 && Date.parse(item.at) <= now.getTime())
    .sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!));
  return additions[0] ? { kind: 'addition', label: additions[0].label, target: additions[0].target } : null;
}
