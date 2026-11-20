import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { UserTable } from '@/components/Auth';
import SyncPanel from './SyncPanel';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const me = await requireRole(['ADMIN']);
  const [stats, users, log] = await Promise.all([
    query(`SELECT (SELECT COUNT(*) FROM "Property")::int AS properties, (SELECT COUNT(*) FROM "User")::int AS users,
                  (SELECT COUNT(*) FROM "SavedProperty")::int AS saved, (SELECT COUNT(*) FROM "Session" WHERE "expiresAt">NOW())::int AS sessions`),
    query(`SELECT "id","name","email","role"::text AS role FROM "User" ORDER BY "createdAt"`),
    query(`SELECT "at","direction","action","title","detail" FROM "SyncLog" ORDER BY "at" DESC, "id" DESC LIMIT 10`),
  ]);
  const s = stats.rows[0];
  return (
    <main className="container">
      <h1>Admin dashboard</h1>
      <p className="muted">Full access: users, all listings (update + delete), PostgreSQL ⇄ Neo4j sync.</p>
      <div className="grid">
        {[['properties', s.properties], ['users', s.users], ['saved listings', s.saved], ['active sessions', s.sessions]].map(([k, v]) => (
          <div className="card" key={String(k)}><h2 style={{ margin: 0 }}>{v}</h2><span className="muted">{k}</span></div>
        ))}
      </div>
      <p><Link className="button" href="/manage">Manage all listings</Link> <Link className="button" href="/add-property">Add property</Link></p>

      <h2 className="section">Users & roles</h2>
      <UserTable selfId={me.userId} rows={users.rows as { id: string; name: string; email: string; role: string }[]} />

      <h2 className="section">PostgreSQL ⇄ Neo4j sync</h2>
      <SyncPanel />
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>When</th><th>Direction</th><th>Action</th><th>Property</th><th>Detail</th></tr></thead>
        <tbody>{log.rows.map((r, i) => <tr key={i}><td>{new Date(r.at).toLocaleString('en-IN')}</td><td>{r.direction}</td><td>{r.action}</td><td>{r.title ?? '-'}</td><td>{r.detail ?? ''}</td></tr>)}</tbody>
      </table>
    </main>
  );
}
