import 'dotenv/config';
import { closePool } from '../lib/db';
import { closeNeo4jDriver } from '../lib/neo4j';
import { ensureGraphSchema, reconcile } from '../lib/sync-core';

/** One full two-way pass, then exit.  npm run sync:once */
async function main() {
  await ensureGraphSchema();
  const s = await reconcile();
  console.log(`Done. PG->Neo4j: ${s.toNeo}, Neo4j->PG: ${s.toPg}, conflicts: ${s.conflicts}, unchanged: ${s.unchanged}`);
  s.errors.forEach((e) => console.warn('error:', e));
}
main()
  .catch((e) => { console.error('Sync failed:', e instanceof Error ? e.message : e); process.exit(1); })
  .finally(async () => { await closePool(); await closeNeo4jDriver(); });
