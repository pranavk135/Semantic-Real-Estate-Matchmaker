import 'dotenv/config';
import { Client } from 'pg';
import { connectionString, closePool } from '../lib/db';
import { closeNeo4jDriver } from '../lib/neo4j';
import { ensureGraphSchema, reconcile } from '../lib/sync-core';

/**
 * Two-way sync watcher.  npm run sync:watch   (run on the laptop that has PostgreSQL)
 *  - PostgreSQL -> Neo4j : instant, via LISTEN/NOTIFY triggers.
 *  - Neo4j -> PostgreSQL : Neo4j cannot push, so it is polled every SYNC_POLL_SECONDS (default 5).
 */
const pollMs = Number(process.env.SYNC_POLL_SECONDS ?? 5) * 1000;
const stamp = () => new Date().toLocaleTimeString();

let running = false;
let again = false;
let debounce: NodeJS.Timeout | undefined;
let schemaReady = false;
let lastError = '';

async function pass(reason: string) {
  if (running) { again = true; return; }
  running = true;
  try {
    if (!schemaReady) { await ensureGraphSchema(); schemaReady = true; }
    const s = await reconcile();
    if (lastError) { console.log(`[${stamp()}] Neo4j reachable again`); lastError = ''; }
    if (s.toNeo || s.toPg || s.conflicts) {
      console.log(`[${stamp()}] (${reason}) PG->Neo4j: ${s.toNeo}  Neo4j->PG: ${s.toPg}  conflicts: ${s.conflicts}`);
    }
    for (const e of s.errors) console.warn(`[${stamp()}] record error: ${e}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
    if (msg !== lastError) { console.warn(`[${stamp()}] sync paused: ${msg} (retrying every ${pollMs / 1000}s)`); lastError = msg; }
  } finally {
    running = false;
    if (again) { again = false; schedule('queued'); }
  }
}
function schedule(reason: string) {
  clearTimeout(debounce);
  debounce = setTimeout(() => void pass(reason), 400);
}

async function listen() {
  const client = new Client({ connectionString: connectionString() });
  client.on('notification', () => schedule('pg change'));
  client.on('error', (e) => { console.warn(`[${stamp()}] LISTEN connection lost: ${e.message}`); });
  client.on('end', () => setTimeout(() => void listen().catch(() => undefined), 3000));
  try {
    await client.connect();
    await client.query('LISTEN property_changed');
    console.log(`[${stamp()}] Listening for PostgreSQL changes`);
  } catch (e) {
    console.warn(`[${stamp()}] cannot LISTEN yet: ${e instanceof Error ? e.message : e}`);
    setTimeout(() => void listen().catch(() => undefined), 3000);
  }
}

async function main() {
  console.log(`Two-way sync watcher. NEO4J_URI=${process.env.NEO4J_URI}  poll=${pollMs / 1000}s  (Ctrl+C to stop)`);
  await listen();
  await pass('startup');
  setInterval(() => void pass('poll'), pollMs);
}

process.on('SIGINT', async () => { await closePool(); await closeNeo4jDriver(); process.exit(0); });
main();
