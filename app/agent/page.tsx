import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { findProperties } from '@/lib/queries';
import ManageTable from '../manage/ManageTable';

export const dynamic = 'force-dynamic';

export default async function AgentPage() {
  const me = await requireRole(['AGENT']);
  const rows = await findProperties({ ownerId: me.userId, allStatuses: true, limit: 100 });
  return (
    <main className="container">
      <h1>Agent dashboard</h1>
      <p className="muted">You can add listings and update price/status on <b>your own</b> listings. Deleting is admin-only.</p>
      <p><Link className="button" href="/add-property">+ Add a new listing</Link></p>
      <section className="card">
        <h2>My listings ({rows.length})</h2>
        <ManageTable rows={JSON.parse(JSON.stringify(rows))} />
      </section>
    </main>
  );
}
