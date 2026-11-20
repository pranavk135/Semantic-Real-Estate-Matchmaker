import { query } from './db';
import { getNeo4jDriver } from './neo4j';

export type ServiceStatus = { ok: boolean; detail: string };

function short(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 200) ?? 'Unknown error';
}

/** Used by the home page and /api/health to show which database is reachable. */
export async function checkHealth(): Promise<{ postgres: ServiceStatus; neo4j: ServiceStatus }> {
  const postgres: ServiceStatus = { ok: false, detail: '' };
  const neo4j: ServiceStatus = { ok: false, detail: '' };

  try {
    await query('SELECT 1');
    postgres.ok = true;
    postgres.detail = 'Connected';
  } catch (e) {
    postgres.detail = short(e);
  }

  try {
    await getNeo4jDriver().verifyConnectivity();
    neo4j.ok = true;
    neo4j.detail = 'Connected';
  } catch (e) {
    neo4j.detail = short(e);
  }

  return { postgres, neo4j };
}
