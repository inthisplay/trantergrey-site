'use client';

import { filmingDates } from '@/lib/filming-dates';
import { useState } from 'react';
import { suggestCommentDates } from '@/lib/comment-signal';

type Props = {
  text: string;
  filmingOn: string;
  dueOn: string;
  disabled: boolean;
  onConfirm: (date: string, meaning: 'filming' | 'due') => Promise<void>;
};

export function NotesDatePrompts({ text, filmingOn, dueOn, disabled, onConfirm }: Props) {
  const [references, setReferences] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dates = suggestCommentDates(text);
  if (!dates.length) return null;
  return <div className="comment-tag-options" aria-label="Dates found in notes">
    {dates.map(date => <details className="comment-date-prompt" key={date}>
      <summary>{filmingDates(filmingOn).includes(date) ? 'Filming' : date === dueOn ? 'Due date' : references.includes(date) ? 'Reference' : 'Date found'} · {date}</summary>
      <div role="group" aria-label={`Meaning of note date ${date}`} className="comment-date-popover">
        <strong>What does {date} mean?</strong>
        <small>Dates without a year use the current year. Choosing filming or due date updates this card.</small>
        {(['filming', 'due', 'reference'] as const).map(meaning => <button type="button" key={meaning} disabled={disabled || saving} onClick={async event => {
          const popup = event.currentTarget.closest('details');
          setError('');
          if (meaning === 'reference') {
            setReferences(current => [...current, date]);
            popup?.removeAttribute('open');
            return;
          }
          setSaving(true);
          try {
            await onConfirm(date, meaning);
            setReferences(current => current.filter(item => item !== date));
            popup?.removeAttribute('open');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to update this date.');
          } finally { setSaving(false); }
        }}>{meaning === 'filming' ? 'Filming date' : meaning === 'due' ? 'Due date' : 'Just a reference'}</button>)}
      </div>
    </details>)}
    {saving && <small role="status">Saving date…</small>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
