import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { reconcile } from '@/lib/sync-core';
import { authorize } from '@/lib/auth';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function pushToGraph(id: string) {
  try { return (await reconcile(id)).errors.length === 0; } catch { return false; }
}

/** UPDATE one row (DML). Changing the price fires trigger trg_price_audit. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await authorize(['ADMIN', 'AGENT']);
  if ('res' in auth) return auth.res;
  const { id } = await params;
  const b = await req.json();
  const price = b.price === undefined ? null : Number(b.price);
  if (price !== null && (!Number.isInteger(price) || price < 0)) {
    return NextResponse.json({ error: 'Price must be a whole number >= 0' }, { status: 400 });
  }
  const status = ['AVAILABLE', 'UNDER_REVIEW', 'SOLD', 'RENTED'].includes(b.status) ? b.status : null;
  const { rows } = await query(
    `UPDATE "Property"
        SET "price"  = COALESCE($2::int, "price"),
            "status" = COALESCE($3::"PropertyStatus", "status")
      WHERE "id" = $1 AND ($4::boolean OR "ownerId" = $5)
      RETURNING "id","title","price","status"`,
    [id, price, status, auth.session.role === 'ADMIN', auth.session.userId]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Not found (or not your listing)' }, { status: 404 });
  return NextResponse.json({ ...rows[0], graphSynced: await pushToGraph(id) });
}

/** DELETE one row (DML). Cascades to PropertyAmenity and PriceAudit. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await authorize(['ADMIN']); // agents cannot delete
  if ('res' in auth) return auth.res;
  const { id } = await params;
  const { rowCount } = await query(`DELETE FROM "Property" WHERE "id" = $1`, [id]);
  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deleted: id, graphSynced: await pushToGraph(id) });
}
