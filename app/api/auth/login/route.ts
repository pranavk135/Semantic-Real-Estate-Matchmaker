import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { createSession, ROLE_HOME, type Role } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const p = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'Enter a valid email and password' }, { status: 400 });
  try {
    const { rows } = await query(`SELECT "id","passwordHash","role"::text AS role FROM "User" WHERE LOWER("email")=LOWER($1)`, [p.data.email]);
    const u = rows[0];
    if (!u || !verifyPassword(p.data.password, u.passwordHash)) return NextResponse.json({ error: 'Wrong email or password' }, { status: 401 });
    if (!(u.role in ROLE_HOME)) return NextResponse.json({ error: 'This account type cannot log in' }, { status: 403 });
    await createSession(u.id);
    return NextResponse.json({ ok: true, redirect: ROLE_HOME[u.role as Role] });
  } catch (e) {
    return NextResponse.json({ error: `${e instanceof Error ? e.message : e} (run npm run auth:setup)` }, { status: 500 });
  }
}
