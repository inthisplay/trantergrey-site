'use client';

import { type FormEvent, useState } from 'react';

const focuses = ['Brand strategy', 'Campaign', 'Video production', 'Digital experience'];
const timelines = ['Right away', 'Next 1–3 months', 'Planning ahead'];

type Inquiry = {
  name: string;
  email: string;
  business: string;
  focus: string;
  timeline: string;
  message: string;
  website: string;
};

const initialInquiry: Inquiry = { name: '', email: '', business: '', focus: '', timeline: '', message: '', website: '' };

export function ProjectInquiryForm() {
  const [step, setStep] = useState(0);
  const [inquiry, setInquiry] = useState(initialInquiry);
  const [error, setError] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const update = (field: keyof Inquiry, value: string) => setInquiry((current) => ({ ...current, [field]: value }));
  const next = () => {
    if (step === 0 && (!inquiry.name.trim() || !inquiry.email.trim() || !inquiry.business.trim())) { setError('A name, email, and business are all we need to start.'); return; }
    if (step === 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) { setError('Add a valid email so we can reply.'); return; }
    if (step === 1 && (!inquiry.focus || !inquiry.timeline)) { setError('Choose a focus and timing to keep us pointed in the right direction.'); return; }
    setError(''); setStep((current) => current + 1);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inquiry.message.trim()) { setError('Give us the short version of what you have in mind.'); return; }
    setState('sending'); setError('');
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inquiry) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Something went sideways. Please try again.');
      setState('sent');
    } catch (reason) {
      setState('idle'); setError(reason instanceof Error ? reason.message : 'Something went sideways. Please try again.');
    }
  };

  if (state === 'sent') return <div className="project-inquiry inquiry-success" aria-live="polite"><p className="inquiry-kicker">Transmission received</p><div className="inquiry-success-mark">✓</div><h3>We&apos;re on it.</h3><p>Thanks, {inquiry.name.split(' ')[0]}. We&apos;ll be in touch soon.</p><button type="button" onClick={() => { setInquiry(initialInquiry); setStep(0); setState('idle'); }}>Start another note ↗</button></div>;

  return <form className="project-inquiry" onSubmit={submit}>
    <div className="inquiry-topline"><p className="inquiry-kicker">Project intake</p><p className="inquiry-progress">0{step + 1} / 03</p></div>
    <div className="inquiry-progress-line"><span style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
    {step === 0 && <section className="inquiry-step" key="hello"><p className="inquiry-prompt">First, tell us who&apos;s making the move.</p><div className="inquiry-fields"><label><span>Your name</span><input value={inquiry.name} onChange={(event) => update('name', event.target.value)} placeholder="First and last" autoComplete="name" /></label><label><span>Work email</span><input type="email" value={inquiry.email} onChange={(event) => update('email', event.target.value)} placeholder="you@company.com" autoComplete="email" /></label><label><span>Business or organization</span><input value={inquiry.business} onChange={(event) => update('business', event.target.value)} placeholder="The name we should know" autoComplete="organization" /></label></div></section>}
    {step === 1 && <section className="inquiry-step" key="direction"><p className="inquiry-prompt">Where would you like to create some momentum?</p><div className="inquiry-choice-group"><span>What&apos;s the focus?</span><div>{focuses.map((item) => <button type="button" className={inquiry.focus === item ? 'selected' : ''} onClick={() => update('focus', item)} key={item}>{item}<i>↗</i></button>)}</div></div><div className="inquiry-choice-group"><span>When should it move?</span><div>{timelines.map((item) => <button type="button" className={inquiry.timeline === item ? 'selected' : ''} onClick={() => update('timeline', item)} key={item}>{item}<i>↗</i></button>)}</div></div></section>}
    {step === 2 && <section className="inquiry-step" key="brief"><p className="inquiry-prompt">Give us the short version.</p><label className="inquiry-message"><span>What are we solving for?</span><textarea autoFocus value={inquiry.message} onChange={(event) => update('message', event.target.value)} placeholder="A rough challenge, an ambitious goal, a good deadline—we&apos;ll take it from there." maxLength={2000} /></label></section>}
    <input className="inquiry-honeypot" tabIndex={-1} autoComplete="off" value={inquiry.website} onChange={(event) => update('website', event.target.value)} aria-hidden="true" />
    {error && <p className="inquiry-error" role="alert">{error}</p>}
    <div className="inquiry-actions">{step > 0 && <button className="inquiry-back" type="button" onClick={() => { setError(''); setStep((current) => current - 1); }}>← Back</button>}{step < 2 ? <button className="inquiry-next" type="button" onClick={next}>Continue <span>→</span></button> : <button className="inquiry-next" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send the brief'} <span>→</span></button>}</div>
  </form>;
}
