import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { reconcile } from '@/lib/sync-core';
import { authorize } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET  -> last 20 sync events.   POST -> run one full two-way sync right now. */
export async function GET() {
  const a = await authorize(['ADMIN']);
  if ('res' in a) return a.res;
  const { rows } = await query(`SELECT * FROM "SyncLog" ORDER BY "at" DESC, "id" DESC LIMIT 20`);
  return NextResponse.json(rows);
}

export async function POST() {
  const a = await authorize(['ADMIN']);
  if ('res' in a) return a.res;
  try {
    return NextResponse.json(await reconcile());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
