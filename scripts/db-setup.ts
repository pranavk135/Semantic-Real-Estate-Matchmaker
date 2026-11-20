import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { connectionString, closePool } from '../lib/db';
import { closeNeo4jDriver } from '../lib/neo4j';
import { ensureGraphSchema, reconcile } from '../lib/sync-core';

/**
 * Runs the plain .sql files in /sql.
 *   npm run db:setup   -> schema.sql + seed.sql (+ first sync to Neo4j if reachable)
 *   npm run db:schema  -> schema.sql only
 *   npm run db:seed    -> seed.sql only
 *   npm run db:reset   -> reset.sql, schema.sql, seed.sql
 */
async function runFile(client: Client, name: string) {
  const text = fs.readFileSync(path.join(process.cwd(), 'sql', name), 'utf8');
  await client.query(text); // simple protocol: multi-statement files are fine
  console.log(`[OK] ${name}`);
}

async function main() {
  const mode = process.argv[2] ?? 'all';
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  try {
    if (mode === 'reset') await runFile(client, 'reset.sql');
    if (mode !== 'seed') await runFile(client, 'schema.sql');
    if (mode !== 'schema') await runFile(client, 'seed.sql');
  } finally {
    await client.end();
  }

  if (mode === 'all' || mode === 'reset' || mode === 'seed') {
    try {
      await ensureGraphSchema();
      const s = await reconcile();
      console.log(`[OK] Neo4j sync: ${s.toNeo} to Neo4j, ${s.toPg} to PostgreSQL`);
    } catch (e) {
      console.warn('\n[!] Neo4j not reachable - PostgreSQL is ready, graph will sync when the watcher runs.');
      console.warn('    ', e instanceof Error ? e.message : e, '\n');
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await closePool(); await closeNeo4jDriver(); });
