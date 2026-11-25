'use client';

import { useEffect, useState, type FormEvent } from 'react';

type TeamMember = { active: number; email: string; nickname: string; createdAt: string; updatedAt: string };
type TeamResponse = { members?: TeamMember[]; member?: TeamMember; error?: string };

async function readResponse(response: Response): Promise<TeamResponse> {
  const body = await response.json().catch(() => ({})) as TeamResponse;
  if (response.status === 401) {
    window.location.replace('/login?next=/admin/access');
    throw new Error('Sign in to manage team names.');
  }
  if (response.status === 403) {
    window.location.replace('/admin');
    throw new Error('This page is restricted to its owner.');
  }
  if (!response.ok) throw new Error(body.error || 'Unable to save team names.');
  return body;
}

export function AdminTeamDirectory() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadMembers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/team-members', { cache: 'no-store' });
      const result = await readResponse(response);
      setMembers(result.members || []);
      setDrafts(Object.fromEntries((result.members || []).map((member) => [member.email, member.nickname])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load team names.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadMembers(); }, []);

  const saveMember = async (event: FormEvent<HTMLFormElement>, memberEmail: string, memberNickname: string) => {
    event.preventDefault();
    setSaving(memberEmail);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/team-members', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: memberEmail, nickname: memberNickname }) });
      const result = await readResponse(response);
      if (result.member) {
        setMembers((current) => [...current.filter((item) => item.email !== result.member?.email), result.member as TeamMember].sort((a, b) => a.nickname.localeCompare(b.nickname)));
        setDrafts((current) => ({ ...current, [memberEmail.toLowerCase()]: result.member?.nickname || memberNickname }));
      }
      setNotice('Nickname saved. It will be used the next time this person signs in.');
      setEmail('');
      setNickname('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save nickname.');
    } finally {
      setSaving('');
    }
  };

  const toggleAccess = async (member: TeamMember) => {
    if (member.active && !window.confirm(`Disable access for ${member.nickname}, sign them out, and revoke their MCP invitations?`)) return;
    setSaving(member.email); setError('');
    try {
      await readResponse(await fetch('/api/admin/team-members', {method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({email:member.email,active:!member.active})}));
      await loadMembers();
      setNotice(member.active ? 'Access disabled and existing sessions revoked.' : 'Access enabled. Revoked MCP invitations stay revoked.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to change access.'); }
    finally { setSaving(''); }
  };

  const signEveryoneOut = async () => {
    if (!window.confirm('Sign everyone out of the Deck and admin area? They will need to sign in with Google Workspace again.')) return;
    setSaving('all-sessions');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/sessions/revoke-all', { method: 'POST' });
      await readResponse(response);
      setNotice('All website sessions have been signed out. Redirecting to sign in…');
      window.setTimeout(() => window.location.replace('/login'), 900);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out all sessions.');
    } finally {
      setSaving('');
    }
  };

  return <div className="admin-team-directory">
    <section className="admin-team-directory-panel">
      <header><div><p className="eyebrow">Deck assignments</p><h2>Team names</h2></div><span>{members.length} {members.length === 1 ? 'person' : 'people'}</span></header>
      <p className="admin-team-directory-intro">Add each person’s Workspace email and the nickname you want shown in assignments and new comments. Only enabled teammates can sign in with Google Workspace. Disabling access signs them out and revokes their invited MCP connections.</p>
      <form className="admin-team-directory-add" onSubmit={(event) => void saveMember(event, email, nickname)}>
        <label><span>Workspace email</span><input type="email" autoComplete="off" placeholder="name@trantergrey.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label><span>Nickname</span><input autoComplete="off" placeholder="Name shown in the Deck" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={80} required /></label>
        <button type="submit" disabled={Boolean(saving)}>Add person</button>
      </form>
      {error && <p className="admin-team-directory-error" role="alert">{error}</p>}
      {notice && <p className="admin-team-directory-notice" role="status">{notice}</p>}
      {loading ? <p className="admin-team-directory-empty">Loading team names…</p> : members.length ? <ul className="admin-team-directory-list">{members.map((member) => <li key={member.email}><form onSubmit={(event) => void saveMember(event, member.email, drafts[member.email] ?? member.nickname)}><span className="admin-team-directory-email">{member.email}</span><label><span className="visually-hidden">Nickname for {member.email}</span><input value={drafts[member.email] ?? member.nickname} onChange={(event) => setDrafts((current) => ({ ...current, [member.email]: event.target.value }))} maxLength={80} required /></label><button type="submit" disabled={Boolean(saving) || (drafts[member.email] ?? member.nickname) === member.nickname}>{saving === member.email ? 'Saving…' : 'Save'}</button><button type="button" disabled={Boolean(saving) || member.email === 'tyler@trantergrey.com'} onClick={() => void toggleAccess(member)}>{member.active ? 'Disable access' : 'Enable access'}</button></form></li>)}</ul> : <p className="admin-team-directory-empty">No nicknames yet. Add the people who should appear in Deck assignments.</p>}
    </section>
    <section className="admin-team-signout-panel"><div><h2>Website sessions</h2><p>Sign out every active session on this site. This does not sign anyone out of Google Workspace.</p></div><button type="button" onClick={() => void signEveryoneOut()} disabled={Boolean(saving)}>{saving === 'all-sessions' ? 'Signing everyone out…' : 'Sign everyone out'}</button></section>
  </div>;
}
