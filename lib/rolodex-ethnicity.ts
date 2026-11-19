export const ethnicityOptions = [
  'American Indian or Alaska Native', 'Asian', 'Black or African American',
  'Hispanic or Latino', 'Middle Eastern or North African',
  'Native Hawaiian or Pacific Islander', 'White', 'Ambiguous',
] as const;
const aliases: Record<string, string> = {
  'african american': 'Black or African American', black: 'Black or African American',
  caucasian: 'White', hispanic: 'Hispanic or Latino', latino: 'Hispanic or Latino',
  'hispanic/latino': 'Hispanic or Latino', 'asian/vietnamese': 'Asian',
};
/** Map only explicit source wording, including the custom casting option Ambiguous. */
export function normalizedEthnicities(value: string | null | undefined): string[] {
  const source = value?.trim().toLowerCase() === 'african american/ambiguous' ? 'Black or African American; Ambiguous' : value;
  const selected = new Set((source || '').split(';').map(part => {
    const key = part.trim().toLowerCase();
    return ethnicityOptions.find(option => option.toLowerCase() === key) || aliases[key];
  }).filter(Boolean));
  return ethnicityOptions.filter(option => selected.has(option));
}
