import 'dotenv/config';
import { query, closePool } from '../lib/db';
import { getNeo4jDriver, closeNeo4jDriver } from '../lib/neo4j';

/** Run BEFORE the demo:  npm run check */
async function main() {
  console.log('NEO4J_URI    =', process.env.NEO4J_URI);
  console.log('DATABASE_URL =', (process.env.DATABASE_URL ?? '').replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@'));
  console.log('');

  try {
    const r = await query<{ c: number }>('SELECT COUNT(*)::int AS c FROM "Property"');
    console.log(`[OK]   PostgreSQL reachable - ${r.rows[0].c} properties`);
  } catch (e) {
    console.log('[FAIL] PostgreSQL:', e instanceof Error ? e.message : e);
  } finally {
    await closePool();
  }

  try {
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();
    const session = driver.session();
    const res = await session.run('MATCH (p:Property) RETURN count(p) AS c');
    await session.close();
    console.log(`[OK]   Neo4j reachable - ${res.records[0].get('c')} Property nodes`);
  } catch (e) {
    console.log('[FAIL] Neo4j:', e instanceof Error ? e.message : e);
    console.log('       -> is the teammate\'s ngrok window still open? ngrok URL changes on every restart.');
  } finally {
    await closeNeo4jDriver();
  }
}
main();
