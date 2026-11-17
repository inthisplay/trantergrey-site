'use client';

import { useMemo, useState } from 'react';

export function TeamMemberPicker({ value, members, onChange, onBlur, disabled = false }: { value: string; members: string[]; onChange: (value: string) => void; onBlur?: () => void; disabled?: boolean }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = value.split(',').map((name) => name.trim()).filter(Boolean);
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return members.filter((name) => !selected.some((person) => person.toLocaleLowerCase() === name.toLocaleLowerCase()) && name.toLocaleLowerCase().includes(normalizedQuery)).slice(0, 8);
  }, [members, query, value]);

  const selectMember = (name: string) => {
    if (selected.some((person) => person.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    onChange([...selected, name].join(', '));
    setQuery('');
    setOpen(true);
  };

  const removeMember = (name: string) => onChange(selected.filter((person) => person.toLocaleLowerCase() !== name.toLocaleLowerCase()).join(', '));

  return <div className="team-member-picker">
    <div className="team-member-picker-control">
      {selected.map((name) => <span className="team-member-picker-chip" key={name}>{name}<button type="button" aria-label={`Remove ${name}`} onMouseDown={(event) => event.preventDefault()} onClick={() => removeMember(name)} disabled={disabled}>×</button></span>)}
      <input value={query} placeholder={selected.length ? 'Search team members…' : 'Choose team members…'} disabled={disabled} onFocus={() => setOpen(true)} onBlur={() => { window.setTimeout(() => setOpen(false), 150); onBlur?.(); }} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === 'Enter' && matches[0]) { event.preventDefault(); selectMember(matches[0]); } if (event.key === 'Escape') setOpen(false); }} />
    </div>
    {open && !disabled && <div className="client-picker-options team-member-picker-options" role="listbox" aria-label="Available team members">{matches.length ? matches.map((name) => <button type="button" role="option" aria-selected="false" key={name} onMouseDown={(event) => event.preventDefault()} onClick={() => selectMember(name)}>{name}</button>) : <span className="team-member-picker-empty">No matching team members.</span>}</div>}
  </div>;
}
