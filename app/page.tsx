import Link from 'next/link';
import { query } from '@/lib/db';
import { checkHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [count, health, recent] = await Promise.all([
    query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM "Property" WHERE "status" = 'AVAILABLE'`)
      .then((r) => r.rows[0].c)
      .catch(() => 0),
    checkHealth(),
    query<{ at: Date; title: string | null; direction: string; action: string }>(
      `SELECT "at","title","direction","action" FROM "SyncLog" ORDER BY "at" DESC, "id" DESC LIMIT 6`
    ).then((r) => r.rows).catch(() => []),
  ]);

  return (
    <main className="container">
      <section className="hero">
        <p className="muted">PROPERTY DISCOVERY, REIMAGINED</p>
        <h1>Find a place that fits your life.</h1>
        <p>Search properties using your requirements, then explore matches using structured data and property relationships.</p>
        <p><Link className="button" href="/search">Find properties →</Link></p>
      </section>

      <div className="grid">
        <div className="card status">
          <span className={`dot ${health.postgres.ok ? 'ok' : 'bad'}`} />
          <div>
            <strong>PostgreSQL</strong>
            <div className="muted">{health.postgres.detail}</div>
          </div>
        </div>
        <div className="card status">
          <span className={`dot ${health.neo4j.ok ? 'ok' : 'bad'}`} />
          <div>
            <strong>Neo4j</strong>
            <div className="muted">{health.neo4j.detail}</div>
          </div>
        </div>
        <div className="card">
          <h2 style={{ margin: 0 }}>{count}</h2>
          <p className="muted" style={{ margin: 0 }}>Available properties in PostgreSQL</p>
        </div>
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <h2>Two-way sync activity</h2>
        {recent.length === 0 ? (
          <p className="muted">No sync events yet. Start the watcher with <code>npm run sync:watch</code>.</p>
        ) : (
          <ul>
            {recent.map((r, i) => (
              <li key={i}>
                <code>{r.direction}</code> {r.action} - {r.title ?? 'system'}{' '}
                <span className="muted">({new Date(r.at).toLocaleTimeString()})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <h2>How it works</h2>
        <ol>
          <li>PostgreSQL stores the canonical property records and applies exact filters.</li>
          <li>Neo4j stores Property, Locality and Amenity nodes and ranks by amenity relationships. A watcher keeps both databases in sync in both directions.</li>
          <li>Both scores are blended with keyword relevance into a match score.</li>
        </ol>
      </section>
    </main>
  );
}
