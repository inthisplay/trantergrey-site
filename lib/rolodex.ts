import { createCatalogCache } from './catalog-cache';

export type TalentMedia = { id: string; personId: string; title: string; kind: 'upload' | 'mux'; contentType: string | null; url: string; thumbnailUrl: string | null; sourceCardId: string | null };
export type Talent = { id: string; name: string; birthday: string | null; age: number | null; ageAsOfYear: number | null; birthYear: number | null; ethnicity: string; ethnicities: string[]; gender: string; tags: string[]; email: string; phone: string; notes: string; coverMediaId: string | null; archivedAt: string | null; cover: TalentMedia | null };
export type TalentHistory = { cardId: string; title: string; tags: string[]; approvedAt: string | null };
export function actualAge(birthday: string | null, today = new Date()) {
  if (!birthday) return null;
  const [year, month, day] = birthday.split('-').map(Number);
  return today.getFullYear() - year - (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0);
}
// Casting ages are estimates; advance the reported age from its reference year.
export function castingAge(person: Pick<Talent, 'age' | 'ageAsOfYear'>, today = new Date()) {
  const year = today.getFullYear();
  if (person.age != null) return person.age + (person.ageAsOfYear == null ? 0 : Math.max(0, year - person.ageAsOfYear));
  return null;
}
async function rawRolodexRequest(path = '', init?: RequestInit) {
  const response = await fetch(`/api/admin/rolodex${path}`, { cache: 'no-store', ...init, signal: init?.signal || AbortSignal.timeout(20_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to save. Please retry.');
  return data;
}
export const rolodexMutation = (body: object) => rolodexRequest('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Catalog only: individual profiles always read fresh. Nothing is persisted to storage.
const catalog = createCatalogCache(() => rawRolodexRequest());
const catalogListeners = new Set<() => void>();
let catalogChannel: BroadcastChannel | undefined;
let listening = false;
function connectCatalog() {
  if (typeof window === 'undefined' || listening) return;
  listening = true;
  if (typeof BroadcastChannel !== 'undefined') {
    catalogChannel = new BroadcastChannel('tg-rolodex-catalog');
    catalogChannel.onmessage = () => { catalog.invalidate(); catalogListeners.forEach(listener => listener()); };
  }
  // Returning to a tab checks the session and catches edits made on another device.
  window.addEventListener('focus', () => { catalog.invalidate(); catalogListeners.forEach(listener => listener()); });
  window.addEventListener('pagehide', () => catalog.invalidate());
}
export function subscribeRolodexCatalog(listener: () => void) {
  connectCatalog(); catalogListeners.add(listener);
  return () => { catalogListeners.delete(listener); };
}
export async function rolodexRequest(path = '', init?: RequestInit) {
  if (typeof window === 'undefined') return rawRolodexRequest(path, init);
  connectCatalog();
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    try { return await catalog.change(() => rawRolodexRequest(path, init)); }
    finally {
      catalogChannel?.postMessage('invalidate');
      catalogListeners.forEach(listener => listener());
    }
  }
  return !path && !init ? catalog.read() : rawRolodexRequest(path, init);
}

export async function withRolodexCatalogChange<T>(save:()=>Promise<T>):Promise<T> {
  connectCatalog();
  try { return await catalog.change(save); }
  finally { catalogChannel?.postMessage('invalidate'); catalogListeners.forEach(listener=>listener()); }
}
