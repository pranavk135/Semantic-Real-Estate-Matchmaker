import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const globalForPg = globalThis as unknown as { pgPool?: Pool };

/** DATABASE_URL without any leftover "?schema=public" (a Prisma-only parameter). */
export function connectionString(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is missing (see .env)');
  return raw.replace(/\?schema=[^&]*&?/, '?').replace(/[?&]$/, '');
}

export function getPool(): Pool {
  if (!globalForPg.pgPool) {
    globalForPg.pgPool = new Pool({
      connectionString: connectionString(),
      max: 10,
      connectionTimeoutMillis: 4000,
    });
    globalForPg.pgPool.on('error', (e) => console.error('PostgreSQL pool error:', e.message));
  }
  return globalForPg.pgPool;
}

/** Parameterised raw SQL:  query('SELECT * FROM "Property" WHERE "id" = $1', [id]) */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/** BEGIN ... COMMIT (ROLLBACK on any error). */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (globalForPg.pgPool) {
    await globalForPg.pgPool.end();
    globalForPg.pgPool = undefined;
  }
}
