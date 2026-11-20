import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { authorize } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const schema = z.object({ propertyId: z.string().min(1) });

async function handle(req: NextRequest, sql: string) {
  const a = await authorize(['USER']);
  if ('res' in a) return a.res;
  const p = schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  try {
    await query(sql, [a.session.userId, p.data.propertyId]);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 400 }); }
}
export const POST = (r: NextRequest) => handle(r, `INSERT INTO "SavedProperty"("userId","propertyId") VALUES ($1,$2) ON CONFLICT DO NOTHING`);
export const DELETE = (r: NextRequest) => handle(r, `DELETE FROM "SavedProperty" WHERE "userId"=$1 AND "propertyId"=$2`);
