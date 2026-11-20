import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { query } from './db';

export type Role = 'ADMIN' | 'AGENT' | 'USER';
export type Session = { userId: string; name: string; email: string; role: Role };

const COOKIE = 'rem_session';
const TTL_HOURS = 8;
export const ROLE_HOME: Record<Role, string> = { ADMIN: '/admin', AGENT: '/agent', USER: '/user' };
export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', AGENT: 'Agent', USER: 'User' };
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  await query(`INSERT INTO "Session"("tokenHash","userId","expiresAt") VALUES ($1,$2,NOW() + make_interval(hours => $3))`, [sha(token), userId, TTL_HOURS]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: TTL_HOURS * 3600 });
}

export async function destroySession() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await query(`DELETE FROM "Session" WHERE "tokenHash"=$1`, [sha(t)]).catch(() => undefined);
  jar.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  try {
    const t = (await cookies()).get(COOKIE)?.value;
    if (!t) return null;
    const { rows } = await query(
      `SELECT u."id",u."name",u."email",u."role"::text AS role FROM "Session" s JOIN "User" u ON u."id"=s."userId"
       WHERE s."tokenHash"=$1 AND s."expiresAt" > NOW()`, [sha(t)]);
    const r = rows[0];
    if (!r || !['ADMIN', 'AGENT', 'USER'].includes(r.role)) return null;
    return { userId: r.id, name: r.name, email: r.email, role: r.role };
  } catch { return null; }
}

/** Server pages: send to /login, or to the user's own dashboard if the role is wrong. */
export async function requireRole(roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roles.includes(s.role)) redirect(ROLE_HOME[s.role]);
  return s;
}

/** API routes:  const a = await authorize(['ADMIN']); if ('res' in a) return a.res; */
export async function authorize(roles: Role[]): Promise<{ session: Session } | { res: NextResponse }> {
  const s = await getSession();
  if (!s) return { res: NextResponse.json({ error: 'Please log in first' }, { status: 401 }) };
  if (!roles.includes(s.role)) return { res: NextResponse.json({ error: `Role ${s.role} is not allowed to do this` }, { status: 403 }) };
  return { session: s };
}
