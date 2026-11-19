export type TalentMedia = { id: string; personId: string; title: string; kind: 'upload' | 'mux'; contentType: string | null; url: string; thumbnailUrl: string | null; sourceCardId: string | null };
export type Talent = { id: string; name: string; birthday: string | null; age: number | null; ageAsOfYear: number | null; birthYear: number | null; ethnicity: string; gender: string; tags: string[]; email: string; phone: string; notes: string; coverMediaId: string | null; archivedAt: string | null; cover: TalentMedia | null };
export type TalentHistory = { cardId: string; title: string; tags: string[]; approvedAt: string | null };
export function actualAge(birthday: string | null, today = new Date()) {
  if (!birthday) return null;
  const [year, month, day] = birthday.split('-').map(Number);
  return today.getFullYear() - year - (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0);
}
// Casting ages are estimates; advance the reported age from its reference year.
export function castingAge(person: Pick<Talent, 'age' | 'ageAsOfYear' | 'birthYear' | 'birthday'>, today = new Date()) {
  const year = today.getFullYear();
  if (person.age != null) return person.age + (person.ageAsOfYear == null ? 0 : Math.max(0, year - person.ageAsOfYear));
  if (person.birthYear != null) return Math.max(0, year - person.birthYear);
  return null;
}
export async function rolodexRequest(path = '', init?: RequestInit) {
  const response = await fetch(`/api/admin/rolodex${path}`, { cache: 'no-store', ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to save. Please retry.');
  return data;
}
export const rolodexMutation = (body: object) => rolodexRequest('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
