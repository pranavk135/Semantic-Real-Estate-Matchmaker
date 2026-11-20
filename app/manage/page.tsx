import Link from 'next/link';
import { query } from '@/lib/db';
import { findProperties } from '@/lib/queries';
import { requireRole } from '@/lib/auth';
import ManageTable from './ManageTable';

export const dynamic = 'force-dynamic';

const JOIN_SQL = `SELECT p."title", p."price", a."name" AS amenity
FROM "Property" p
JOIN "PropertyAmenity" pa ON pa."propertyId" = p."id"
JOIN "Amenity" a          ON a."id" = pa."amenityId"
ORDER BY p."title", a."name";`;

export default async function ManagePage() {
  await requireRole(['ADMIN']);
  const rows = await findProperties({ allStatuses: true, limit: 100 });
  const audit = await query<{ id: number; title: string; oldPrice: number; newPrice: number; changedAt: Date }>(
    `SELECT pa."id", p."title", pa."oldPrice", pa."newPrice", pa."changedAt"
       FROM "PriceAudit" pa JOIN "Property" p ON p."id" = pa."propertyId"
      ORDER BY pa."changedAt" DESC, pa."id" DESC LIMIT 8`
  ).then((r) => r.rows).catch(() => []);

  return (
    <main className="container">
      <h1>Manage listings</h1>
      <p className="muted">
        INSERT: <Link href="/add-property">Add a new listing</Link>. UPDATE and DELETE: use the buttons in the table.
      </p>

      <section className="card">
        <h2>Listings</h2>
        <p className="muted">
          The <b>Amenities</b> column is produced by a 3-table JOIN (SQL below).
        </p>
        <ManageTable canDelete rows={JSON.parse(JSON.stringify(rows))} />
        <details style={{ marginTop: 12 }}>
          <summary>Show the JOIN query</summary>
          <pre>{JOIN_SQL}</pre>
        </details>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <h2>Price audit log (filled by a trigger)</h2>
        <p className="muted">
          Trigger <code>trg_price_audit</code> runs automatically after any change of <code>price</code>. Edit a price above and a row appears here.
        </p>
        {audit.length === 0 ? <p className="muted">No price changes yet.</p> : (
          <table>
            <thead><tr><th>Property</th><th>Old price</th><th>New price</th><th>When</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>{a.oldPrice?.toLocaleString('en-IN')}</td>
                  <td>{a.newPrice?.toLocaleString('en-IN')}</td>
                  <td>{new Date(a.changedAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
