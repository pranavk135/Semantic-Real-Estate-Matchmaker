import neo4j, { Driver } from 'neo4j-driver';

const globalForNeo4j = globalThis as unknown as { neo4jDriver?: Driver };

/**
 * Lazily creates one shared Neo4j driver.
 * Short timeouts so that if the teammate's laptop is unreachable the app falls
 * back to SQL-only search quickly instead of hanging during the demo.
 */
export function getNeo4jDriver(): Driver {
  if (!globalForNeo4j.neo4jDriver) {
    const uri = process.env.NEO4J_URI;
    const username = process.env.NEO4J_USERNAME;
    const password = process.env.NEO4J_PASSWORD;
    if (!uri || !username || !password) {
      throw new Error('Neo4j environment variables are missing (NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD)');
    }
    globalForNeo4j.neo4jDriver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      connectionTimeout: 4000,
      maxTransactionRetryTime: 4000,
      connectionAcquisitionTimeout: 5000,
    });
  }
  return globalForNeo4j.neo4jDriver;
}

export async function closeNeo4jDriver() {
  if (globalForNeo4j.neo4jDriver) {
    await globalForNeo4j.neo4jDriver.close();
    globalForNeo4j.neo4jDriver = undefined;
  }
}
