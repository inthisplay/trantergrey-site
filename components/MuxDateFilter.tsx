'use client';

import { ChevronDown } from 'pixelarticons/react';
import { useId, useRef, useState } from 'react';

export type MuxDateRange = { start: string; end: string };

export function muxDateKey(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('-');
}

const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const dayLabel = new Intl.DateTimeFormat('en', { dateStyle: 'long' });
const shortLabel = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
const formatKey = (key: string) => shortLabel.format(new Date(`${key}T12:00:00`));

export function MuxDateFilter({ range, years, onChange }: {
  range: MuxDateRange | null;
  years: number[];
  onChange: (range: MuxDateRange | null) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [month, setMonth] = useState(() => new Date());
  const [start, setStart] = useState('');
  const fullYear = range && range.start.endsWith('-01-01') && range.end === `${range.start.slice(0, 4)}-12-31`
    ? range.start.slice(0, 4) : '';
  const yearOptions = [...new Set([...years, ...(fullYear ? [Number(fullYear)] : [])])].sort((a, b) => b - a);

  function apply(next: MuxDateRange | null) {
    onChange(next);
    panel.current?.hidePopover();
    trigger.current?.focus();
  }

  return <div className="mux-date-filter">
    <span id={`${id}-label`}>Date</span>
    <button ref={trigger} className="mux-date-trigger" type="button" popoverTarget={id}
      aria-labelledby={`${id}-label ${id}-value`} onClick={() => {
        setStart('');
        setMonth(range ? new Date(`${range.start}T12:00:00`) : years.length ? new Date(years[0], 11, 1) : new Date());
      }}>
      <span id={`${id}-value`}>{fullYear || (range ? range.start === range.end ? formatKey(range.start) : `${formatKey(range.start)} – ${formatKey(range.end)}` : 'All dates')}</span>
      <ChevronDown aria-hidden="true" />
    </button>
    <div ref={panel} id={id} popover="auto" className="mux-date-popover" role="region" aria-label="Date filter">
      <div className="mux-date-controls">
        <label>Full year<select value={fullYear} onChange={(event) => {
          const year = event.target.value;
          apply(year ? { start: `${year}-01-01`, end: `${year}-12-31` } : null);
        }}>
          <option value="">Select year</option>
          {yearOptions.map((year) => <option key={year}>{year}</option>)}
        </select></label>
        <button type="button" onClick={() => apply(null)}>Clear dates</button>
      </div>
      <div className="mux-date-navigation">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <span role="status">{start ? 'Choose an end date' : 'Choose a start date'}</span>
        <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="mux-date-months">
        {[0, 1].map((offset) => {
          const first = new Date(month.getFullYear(), month.getMonth() + offset, 1);
          const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
          return <section key={muxDateKey(first)} aria-label={monthLabel.format(first)}>
            <h3>{monthLabel.format(first)}</h3>
            <div className="mux-date-days">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day} aria-hidden="true">{day}</span>)}
              {Array.from({ length: first.getDay() }, (_, index) => <span key={index} aria-hidden="true" />)}
              {Array.from({ length: count }, (_, index) => {
                const date = new Date(first.getFullYear(), first.getMonth(), index + 1);
                const key = muxDateKey(date);
                const selected = start ? key === start : Boolean(range && key >= range.start && key <= range.end);
                return <button key={key} type="button" aria-label={dayLabel.format(date)} aria-pressed={selected}
                  onClick={() => start ? apply({ start: start < key ? start : key, end: start < key ? key : start }) : setStart(key)}>{index + 1}</button>;
              })}
            </div>
          </section>;
        })}
      </div>
    </div>
  </div>;
}
