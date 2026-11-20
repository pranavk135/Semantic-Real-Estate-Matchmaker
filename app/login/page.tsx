import { redirect } from 'next/navigation';
import { getSession, ROLE_HOME } from '@/lib/auth';
import { LoginForm } from '@/components/Auth';
export const dynamic = 'force-dynamic';
export default async function Login() {
  const s = await getSession();
  if (s) redirect(ROLE_HOME[s.role]);
  return <main className="container"><h1>Log in</h1><p className="muted">Admin, Agent and User each land on their own dashboard.</p><LoginForm /></main>;
}
