'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  return <button className="linkbtn" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }}>Logout</button>;
}

const DEMO = [
  { label: 'Admin', email: 'admin@realestate.com', password: 'admin123' },
  { label: 'Agent', email: 'agent@realestate.com', password: 'agent123' },
  { label: 'User', email: 'user@realestate.com', password: 'user123' },
];

export function LoginForm() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const d = await r.json();
    if (!r.ok) { setError(d.error || 'Login failed'); setBusy(false); return; }
    window.location.href = d.redirect;
  }
  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 420 }}>
      <label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label style={{ marginTop: 12 }}>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <p><button disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button></p>
      {error && <div className="notice err">{error}</div>}
      <p className="muted">Demo accounts (click to fill):</p>
      {DEMO.map((d) => <button type="button" className="btn-light" key={d.label} style={{ marginRight: 8 }} onClick={() => { setEmail(d.email); setPassword(d.password); }}>{d.label}</button>)}
    </form>
  );
}

export function SaveButton({ propertyId, saved }: { propertyId: string; saved: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch('/api/saved', { method: saved ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId }) });
    setBusy(false); router.refresh();
  }
  return <button className={saved ? 'btn-light' : ''} disabled={busy} onClick={toggle}>{saved ? '★ Saved (remove)' : '☆ Save'}</button>;
}

type U = { id: string; name: string; email: string; role: string };
const ROLES = ['ADMIN', 'AGENT', 'USER'];
export function UserTable({ rows, selfId }: { rows: U[]; selfId: string }) {
  const router = useRouter();
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'USER' });
  async function call(method: string, body: unknown, ok: string) {
    const r = await fetch('/api/admin/users', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    setMsg(r.ok ? { t: ok, c: 'ok' } : { t: d.error || 'Failed', c: 'err' });
    if (r.ok) router.refresh();
    return r.ok;
  }
  return (
    <>
      <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await call('POST', f, `Created ${f.email}`)) setF({ name: '', email: '', password: '', role: 'BUYER' }); }}>
        <h3 style={{ marginTop: 0 }}>Create user</h3>
        <div className="form">
          <div><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div><label>Email</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
          <div><label>Password</label><input type="password" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></div>
          <div><label>Role</label><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
        </div>
        <p><button>Create</button></p>
      </form>
      {msg && <div className={`notice ${msg.c}`}>{msg.t}</div>}
      <table style={{ marginTop: 14 }}>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>{u.name}{u.id === selfId && ' (you)'}</td><td>{u.email}</td>
              <td><select value={roles[u.id] ?? u.role} disabled={u.id === selfId} onChange={(e) => setRoles({ ...roles, [u.id]: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}{!ROLES.includes(u.role) && <option>{u.role}</option>}</select></td>
              <td>
                <button disabled={u.id === selfId || !roles[u.id] || roles[u.id] === u.role} onClick={() => call('PATCH', { id: u.id, role: roles[u.id] }, 'Role updated')}>Save role</button>{' '}
                <button className="btn-danger" disabled={u.id === selfId} onClick={() => confirm(`Delete ${u.email}?`) && call('DELETE', { id: u.id }, 'User deleted')}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
