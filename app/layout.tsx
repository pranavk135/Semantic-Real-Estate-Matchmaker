import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getSession, ROLE_LABEL } from '@/lib/auth';
import { LogoutButton } from '@/components/Auth';

export const metadata: Metadata = { title: 'Semantic Real Estate Matchmaker', description: 'Find properties that fit your needs.' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const s = await getSession();
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <strong>🏡 Semantic Matchmaker</strong>
          <nav>
            <Link href="/">Home</Link>
            <Link href="/search">Search</Link>
            {s?.role === 'USER' && <Link href="/user">My Dashboard</Link>}
            {s?.role === 'AGENT' && <><Link href="/agent">Agent Dashboard</Link><Link href="/add-property">Add Property</Link></>}
            {s?.role === 'ADMIN' && <><Link href="/admin">Admin</Link><Link href="/manage">Manage</Link><Link href="/add-property">Add Property</Link></>}
            {s ? <><span className="who">{s.name}<span className="badge role">{ROLE_LABEL[s.role]}</span></span><LogoutButton /></> : <Link href="/login">Login</Link>}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
