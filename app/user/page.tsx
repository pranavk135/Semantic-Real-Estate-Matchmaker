import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { findProperties } from '@/lib/queries';
import { SaveButton } from '@/components/Auth';

export const dynamic = 'force-dynamic';

export default async function UserPage() {
  const me = await requireRole(['USER']);
  const [props, saved] = await Promise.all([
    findProperties({ limit: 60 }),
    query(`SELECT "propertyId" FROM "SavedProperty" WHERE "userId"=$1`, [me.userId]),
  ]);
  const ids = new Set<string>(saved.rows.map((r) => r.propertyId));
  const mine = props.filter((p) => ids.has(p.id));
  const Card = ({ p }: { p: (typeof props)[number] }) => (
    <article className="card" key={p.id}>
      <div className="muted">{p.locality}, {p.city}</div>
      <h3>{p.title}</h3>
      <p className="price">₹{Number(p.price).toLocaleString('en-IN')}</p>
      <p>{p.bedrooms} BHK · {p.areaSqFt} sq.ft.</p>
      <div>{p.amenities.map((a) => <span className="tag" key={a.amenity.name}>{a.amenity.name}</span>)}</div>
      <p><SaveButton propertyId={p.id} saved={ids.has(p.id)} /></p>
    </article>
  );
  return (
    <main className="container">
      <h1>Welcome, {me.name}</h1>
      <p className="muted">Browse and save listings. <Link href="/search" style={{ textDecoration: 'underline' }}>Open graph-powered search →</Link></p>
      <h2 className="section">Saved ({mine.length})</h2>
      {mine.length ? <div className="grid">{mine.map((p) => <Card key={p.id} p={p} />)}</div> : <p className="muted">Nothing saved yet.</p>}
      <h2 className="section">Available listings</h2>
      <div className="grid">{props.map((p) => <Card key={p.id} p={p} />)}</div>
    </main>
  );
}
