import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { hashPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';
const ROLE = z.enum(['ADMIN', 'AGENT', 'USER']);
const fail = (e: unknown) => NextResponse.json({ error: (e as { code?: string }).code === '23505' ? 'Email already exists' : String(e instanceof Error ? e.message : e) }, { status: 400 });

export async function POST(req: NextRequest) {
  const a = await authorize(['ADMIN']); if ('res' in a) return a.res;
  const p = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), role: ROLE }).safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: 'Name, email, password (6+) and role required' }, { status: 400 });
  try {
    await query(`INSERT INTO "User"("name","email","passwordHash","role") VALUES ($1,$2,$3,$4::"UserRole")`, [p.data.name, p.data.email, hashPassword(p.data.password), p.data.role]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  const a = await authorize(['ADMIN']); if ('res' in a) return a.res;
  const p = z.object({ id: z.string(), role: ROLE }).safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: 'id and role required' }, { status: 400 });
  if (p.data.id === a.session.userId) return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
  try {
    const r = await query(`UPDATE "User" SET "role"=$2::"UserRole" WHERE "id"=$1`, [p.data.id, p.data.role]);
    return r.rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'User not found' }, { status: 404 });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  const a = await authorize(['ADMIN']); if ('res' in a) return a.res;
  const p = z.object({ id: z.string() }).safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (p.data.id === a.session.userId) return NextResponse.json({ error: 'You cannot delete yourself' }, { status: 400 });
  try {
    const r = await query(`DELETE FROM "User" WHERE "id"=$1`, [p.data.id]);
    return r.rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'User not found' }, { status: 404 });
  } catch (e) { return fail(e); }
}
