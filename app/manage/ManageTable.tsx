'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = {
  id: string; title: string; locality: string; price: number; status: string;
  amenities: { amenity: { name: string } }[];
};

export default function ManageTable({ rows, canDelete = false }: { rows: Row[]; canDelete?: boolean }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, { price: string; status: string }>>({});
  const [msg, setMsg] = useState('');

  const val = (r: Row) => edits[r.id] ?? { price: String(r.price), status: r.status };
  const set = (r: Row, patch: Partial<{ price: string; status: string }>) =>
    setEdits({ ...edits, [r.id]: { ...val(r), ...patch } });

  async function save(r: Row) {
    const v = val(r);
    const res = await fetch(`/api/properties/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: Number(v.price), status: v.status }),
    });
    const d = await res.json();
    setMsg(res.ok ? `UPDATED "${d.title}" (graph synced: ${d.graphSynced})` : `Error: ${d.error}`);
    router.refresh();
  }
  async function remove(r: Row) {
    if (!confirm(`Delete "${r.title}"?`)) return;
    const res = await fetch(`/api/properties/${r.id}`, { method: 'DELETE' });
    const d = await res.json();
    setMsg(res.ok ? `DELETED "${r.title}" (graph synced: ${d.graphSynced})` : `Error: ${d.error}`);
    router.refresh();
  }

  return (
    <>
      {msg && <div className="notice">{msg}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Title</th><th>Locality</th><th>Price</th><th>Status</th><th>Amenities (JOIN)</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{r.locality}</td>
                <td><input type="number" value={val(r).price} onChange={(e) => set(r, { price: e.target.value })} style={{ width: 110 }} /></td>
                <td>
                  <select value={val(r).status} onChange={(e) => set(r, { status: e.target.value })}>
                    {['AVAILABLE', 'UNDER_REVIEW', 'SOLD', 'RENTED'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td>{r.amenities.map((a) => a.amenity.name).join(', ') || '-'}</td>
                <td>
                  <button type="button" onClick={() => save(r)}>Update</button>{' '}
                  {canDelete && <button type="button" onClick={() => remove(r)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
