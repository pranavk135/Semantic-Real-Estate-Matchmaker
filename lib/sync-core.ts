/**
 * TWO-WAY SYNC  PostgreSQL <-> Neo4j
 * ---------------------------------------------------------------------
 * Both databases hold the same Property records. Every property has a
 * "fingerprint" (hash of its synced fields + amenity list). The table
 * "SyncState" remembers the fingerprint both sides agreed on last time.
 *
 * For every property id we compare three things: PG hash, Neo4j hash, last agreed hash.
 *
 *   only in PG,    never synced    -> created in PG   -> copy to Neo4j
 *   only in Neo4j, never synced    -> created in Neo4j -> copy to PG
 *   only in PG,    was synced      -> deleted in Neo4j -> delete in PG
 *   only in Neo4j, was synced      -> deleted in PG    -> delete in Neo4j
 *   both, equal                    -> nothing to do
 *   both, only PG changed          -> PG -> Neo4j
 *   both, only Neo4j changed       -> Neo4j -> PG
 *   both changed since last sync   -> CONFLICT: PostgreSQL wins (source of truth)
 *
 * Synced fields: title, description, city, locality, price, bedrooms, bathrooms,
 * areaSqFt, propertyType, listingType, status + amenity names.
 * (address / latitude / longitude / imageUrl / owner stay PostgreSQL-only.)
 */
import crypto from 'node:crypto';
import neo4j, { Integer } from 'neo4j-driver';
import { query, tx } from './db';
import { getNeo4jDriver } from './neo4j';
import { setPropertyAmenities } from './queries';

export const STATUSES = ['AVAILABLE', 'UNDER_REVIEW', 'SOLD', 'RENTED'] as const;
export const LISTING_TYPES = ['SALE', 'RENT'] as const;

export type PropertyRec = {
  id: string;
  title: string;
  description: string;
  city: string;
  locality: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  areaSqFt: number;
  propertyType: string;
  listingType: (typeof LISTING_TYPES)[number];
  status: (typeof STATUSES)[number];
  amenities: string[];
};

export type SyncSummary = { toNeo: number; toPg: number; conflicts: number; unchanged: number; errors: string[] };

// ---------------------------------------------------------------- canonical form
function toNum(v: unknown, d: number): number {
  if (neo4j.isInt(v)) return (v as Integer).toNumber();
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return d;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : d;
}
function toStr(v: unknown, d: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : d;
}
function pick<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return (allowed as readonly string[]).includes(s) ? (s as T) : d;
}

/** Normalises a row/node into one shape. Missing Neo4j properties get safe defaults. */
export function canon(raw: Record<string, unknown>, fallback: { city?: string; locality?: string } = {}): PropertyRec {
  const names = Array.isArray(raw.amenities) ? (raw.amenities as unknown[]) : [];
  const amenities = [...new Set(names.filter((n): n is string => typeof n === 'string').map((n) => n.trim()).filter(Boolean))].sort();
  const title = toStr(raw.title, 'Untitled property');
  return {
    id: String(raw.id),
    title,
    description: toStr(raw.description, title),
    city: toStr(raw.city, fallback.city ?? 'Unknown'),
    locality: toStr(raw.locality, fallback.locality ?? 'Unknown'),
    price: toNum(raw.price, 0),
    bedrooms: toNum(raw.bedrooms, 1),
    bathrooms: toNum(raw.bathrooms, 1),
    areaSqFt: toNum(raw.areaSqFt, 0),
    propertyType: toStr(raw.propertyType, 'Apartment'),
    listingType: pick(raw.listingType, LISTING_TYPES, 'SALE'),
    status: pick(raw.status, STATUSES, 'AVAILABLE'),
    amenities,
  };
}

export function hashOf(r: PropertyRec): string {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify([r.title, r.description, r.city, r.locality, r.price, r.bedrooms, r.bathrooms,
      r.areaSqFt, r.propertyType, r.listingType, r.status, r.amenities]))
    .digest('hex');
}

// ---------------------------------------------------------------- Neo4j side (Cypher)
export async function ensureGraphSchema() {
  const session = getNeo4jDriver().session();
  try {
    await session.run('CREATE CONSTRAINT property_id IF NOT EXISTS FOR (p:Property) REQUIRE p.id IS UNIQUE');
    await session.run('CREATE CONSTRAINT amenity_name IF NOT EXISTS FOR (a:Amenity) REQUIRE a.name IS UNIQUE');
  } finally {
    await session.close();
  }
}

/** Nodes created by hand in Neo4j Browser may have no id: give them one. */
async function assignMissingNeoIds(): Promise<number> {
  const session = getNeo4jDriver().session();
  try {
    const res = await session.run(
      `MATCH (p:Property) WHERE p.id IS NULL
       SET p.id = 'neo_' + randomUUID()
       RETURN count(p) AS c`
    );
    return toNum(res.records[0]?.get('c'), 0);
  } finally {
    await session.close();
  }
}

async function readNeo(id?: string): Promise<Map<string, PropertyRec>> {
  const session = getNeo4jDriver().session();
  try {
    const res = await session.run(
      `MATCH (p:Property) ${id ? 'WHERE p.id = $id' : ''}
       OPTIONAL MATCH (p)-[:HAS_AMENITY]->(a:Amenity)
       WITH p, collect(DISTINCT a.name) AS amenities
       OPTIONAL MATCH (p)-[:LOCATED_IN]->(l:Locality)
       WITH p, amenities, head(collect(l)) AS loc
       RETURN p {.*} AS props, amenities, loc.name AS locName, loc.city AS locCity`,
      id ? { id } : {}
    );
    const out = new Map<string, PropertyRec>();
    for (const rec of res.records) {
      const props = rec.get('props') as Record<string, unknown>;
      if (props.id === null || props.id === undefined) continue;
      out.set(String(props.id), canon(
        { ...props, amenities: rec.get('amenities') },
        { city: rec.get('locCity') ?? undefined, locality: rec.get('locName') ?? undefined }
      ));
    }
    return out;
  } finally {
    await session.close();
  }
}

async function writeNeo(r: PropertyRec) {
  const session = getNeo4jDriver().session();
  try {
    await session.executeWrite(async (t) => {
      await t.run(
        `MERGE (p:Property {id: $id})
         SET p.title = $title, p.description = $description, p.city = $city, p.locality = $locality,
             p.price = $price, p.bedrooms = $bedrooms, p.bathrooms = $bathrooms, p.areaSqFt = $areaSqFt,
             p.propertyType = $propertyType, p.listingType = $listingType, p.status = $status,
             p.updatedAt = timestamp()`,
        {
          id: r.id, title: r.title, description: r.description, city: r.city, locality: r.locality,
          price: neo4j.int(r.price), bedrooms: neo4j.int(r.bedrooms), bathrooms: neo4j.int(r.bathrooms),
          areaSqFt: neo4j.int(r.areaSqFt), propertyType: r.propertyType, listingType: r.listingType, status: r.status,
        }
      );
      // locality relationship: replace
      await t.run(`MATCH (p:Property {id: $id}) OPTIONAL MATCH (p)-[old:LOCATED_IN]->(:Locality) DELETE old`, { id: r.id });
      await t.run(
        `MATCH (p:Property {id: $id})
         MERGE (l:Locality {name: $locality, city: $city})
         MERGE (p)-[:LOCATED_IN]->(l)`,
        { id: r.id, locality: r.locality, city: r.city }
      );
      // amenity relationships: remove the ones no longer wanted, add the missing
      await t.run(
        `MATCH (p:Property {id: $id})-[rel:HAS_AMENITY]->(a:Amenity)
         WHERE NOT a.name IN $amenities
         DELETE rel`,
        { id: r.id, amenities: r.amenities }
      );
      await t.run(
        `MATCH (p:Property {id: $id})
         UNWIND $amenities AS amenityName
         MERGE (a:Amenity {name: amenityName})
         MERGE (p)-[:HAS_AMENITY]->(a)`,
        { id: r.id, amenities: r.amenities }
      );
    });
  } finally {
    await session.close();
  }
}

async function deleteNeo(id: string) {
  const session = getNeo4jDriver().session();
  try {
    await session.run('MATCH (p:Property {id: $id}) DETACH DELETE p', { id });
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------- PostgreSQL side (SQL)
async function readPg(id?: string): Promise<Map<string, PropertyRec>> {
  const { rows } = await query(
    `SELECT p."id", p."title", p."description", p."city", p."locality", p."price", p."bedrooms",
            p."bathrooms", p."areaSqFt", p."propertyType", p."listingType", p."status",
            COALESCE(array_agg(a."name" ORDER BY a."name") FILTER (WHERE a."name" IS NOT NULL), ARRAY[]::text[]) AS amenities
     FROM "Property" p
     LEFT JOIN "PropertyAmenity" pa ON pa."propertyId" = p."id"
     LEFT JOIN "Amenity" a          ON a."id" = pa."amenityId"
     ${id ? 'WHERE p."id" = $1' : ''}
     GROUP BY p."id"`,
    id ? [id] : []
  );
  return new Map(rows.map((r) => [r.id as string, canon(r)]));
}

async function writePg(r: PropertyRec) {
  await tx(async (c) => {
    await c.query(
      `INSERT INTO "Property"
         ("id","title","description","city","locality","price","bedrooms","bathrooms","areaSqFt","propertyType","listingType","status")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::"ListingType",$12::"PropertyStatus")
       ON CONFLICT ("id") DO UPDATE SET
         "title" = EXCLUDED."title", "description" = EXCLUDED."description", "city" = EXCLUDED."city",
         "locality" = EXCLUDED."locality", "price" = EXCLUDED."price", "bedrooms" = EXCLUDED."bedrooms",
         "bathrooms" = EXCLUDED."bathrooms", "areaSqFt" = EXCLUDED."areaSqFt",
         "propertyType" = EXCLUDED."propertyType", "listingType" = EXCLUDED."listingType",
         "status" = EXCLUDED."status"`,
      [r.id, r.title, r.description, r.city, r.locality, r.price, r.bedrooms, r.bathrooms,
       r.areaSqFt, r.propertyType, r.listingType, r.status]
    );
    await setPropertyAmenities(c, r.id, r.amenities);
  });
}

async function deletePg(id: string) {
  await query('DELETE FROM "Property" WHERE "id" = $1', [id]); // cascades to PropertyAmenity
}

// ---------------------------------------------------------------- bookkeeping
async function readState(id?: string): Promise<Map<string, string>> {
  const { rows } = await query(
    `SELECT "propertyId", "hash" FROM "SyncState" ${id ? 'WHERE "propertyId" = $1' : ''}`,
    id ? [id] : []
  );
  return new Map(rows.map((r) => [r.propertyId as string, r.hash as string]));
}
const setState = (id: string, hash: string) =>
  query(
    `INSERT INTO "SyncState" ("propertyId","hash") VALUES ($1,$2)
     ON CONFLICT ("propertyId") DO UPDATE SET "hash" = EXCLUDED."hash", "syncedAt" = CURRENT_TIMESTAMP`,
    [id, hash]
  );
const dropState = (id: string) => query('DELETE FROM "SyncState" WHERE "propertyId" = $1', [id]);

async function log(id: string | null, title: string | null, direction: string, action: string, detail = '') {
  await query(
    `INSERT INTO "SyncLog" ("propertyId","title","direction","action","detail") VALUES ($1,$2,$3,$4,$5)`,
    [id, title, direction, action, detail]
  );
}

// ---------------------------------------------------------------- the reconcile loop
/**
 * Brings both databases in line. Call with no argument for a full pass (watcher / sync:once)
 * or with a property id for a quick single-record pass (used right after the web form saves).
 * Throws if Neo4j is unreachable; PostgreSQL is never touched in that case.
 */
export async function reconcile(onlyId?: string): Promise<SyncSummary> {
  const summary: SyncSummary = { toNeo: 0, toPg: 0, conflicts: 0, unchanged: 0, errors: [] };

  if (!onlyId) {
    const fixed = await assignMissingNeoIds();
    if (fixed) await log(null, null, 'SYSTEM', 'WARN', `${fixed} Neo4j node(s) had no id; assigned one`);
  }

  const [pgMap, neoMap, state] = await Promise.all([readPg(onlyId), readNeo(onlyId), readState(onlyId)]);

  // Safety net: a whole side that is suddenly EMPTY means it was wiped/reset, not that
  // every record was deleted. Rebuild it from the other side instead of propagating deletes.
  if (!onlyId && state.size > 0) {
    if (neoMap.size === 0 && pgMap.size > 0) {
      await query('DELETE FROM "SyncState"');
      state.clear();
      await log(null, null, 'SYSTEM', 'WARN', 'Neo4j graph is empty: rebuilding it from PostgreSQL');
    } else if (pgMap.size === 0 && neoMap.size > 0) {
      await query('DELETE FROM "SyncState"');
      state.clear();
      await log(null, null, 'SYSTEM', 'WARN', 'PostgreSQL has no properties: restoring them from Neo4j');
    }
  }

  const ids = new Set<string>([...pgMap.keys(), ...neoMap.keys(), ...state.keys()]);
  if (onlyId) ids.add(onlyId);

  for (const id of ids) {
    const pg = pgMap.get(id);
    const neo = neoMap.get(id);
    const last = state.get(id);
    try {
      if (!pg && !neo) {
        if (last) await dropState(id);
      } else if (pg && !neo) {
        if (last) {
          await deletePg(id);
          await dropState(id);
          await log(id, pg.title, 'NEO->PG', 'DELETE', 'Node removed in Neo4j, row removed in PostgreSQL');
          summary.toPg++;
        } else {
          await writeNeo(pg);
          await setState(id, hashOf(pg));
          await log(id, pg.title, 'PG->NEO', 'CREATE', 'New row copied to Neo4j');
          summary.toNeo++;
        }
      } else if (!pg && neo) {
        if (last) {
          await deleteNeo(id);
          await dropState(id);
          await log(id, neo.title, 'PG->NEO', 'DELETE', 'Row removed in PostgreSQL, node removed in Neo4j');
          summary.toNeo++;
        } else {
          await writePg(neo);
          await writeNeo(neo); // write the normalised version back so both sides are identical
          await setState(id, hashOf(neo));
          await log(id, neo.title, 'NEO->PG', 'CREATE', 'New node copied to PostgreSQL');
          summary.toPg++;
        }
      } else if (pg && neo) {
        const hp = hashOf(pg);
        const hn = hashOf(neo);
        if (hp === hn) {
          if (last !== hp) await setState(id, hp);
          summary.unchanged++;
        } else if (last === undefined || (hp !== last && hn !== last)) {
          await writeNeo(pg);
          await setState(id, hp);
          await log(id, pg.title, 'PG->NEO', 'CONFLICT', 'Changed on both sides; PostgreSQL version kept');
          summary.conflicts++;
        } else if (hn === last) {
          await writeNeo(pg);
          await setState(id, hp);
          await log(id, pg.title, 'PG->NEO', 'UPDATE', 'PostgreSQL change copied to Neo4j');
          summary.toNeo++;
        } else {
          await writePg(neo);
          await writeNeo(neo);
          await setState(id, hn);
          await log(id, neo.title, 'NEO->PG', 'UPDATE', 'Neo4j change copied to PostgreSQL');
          summary.toPg++;
        }
      }
    } catch (e) {
      summary.errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return summary;
}
