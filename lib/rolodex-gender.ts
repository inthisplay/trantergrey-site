export const genderOptions = ['Male', 'Female', 'N/A'] as const;
export function normalizedGender(value: string | null | undefined): typeof genderOptions[number] {
  switch (value?.trim().toLowerCase()) {
    case 'male': case 'boy': return 'Male';
    case 'female': case 'girl': return 'Female';
    default: return 'N/A';
  }
}
