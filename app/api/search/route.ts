import { NextRequest, NextResponse } from 'next/server';
import { findProperties } from '@/lib/queries';
import { getNeo4jDriver } from '@/lib/neo4j';
import { searchSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Hybrid search
 *  1) PostgreSQL applies the structured filters with a hand-written SQL JOIN query.
 *  2) Neo4j traverses (Property)-[:HAS_AMENITY]->(Amenity) to score amenity matches.
 *     If Neo4j is unreachable, the same amenity score is computed from PostgreSQL.
 *  3) A keyword score on the free-text query is blended in.
 * This is graph + keyword ranking, not embedding-based semantic search.
 */
export async function POST(request: NextRequest) {
  const parsed = searchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid search', details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const wanted = input.amenities.map((a) => a.trim().toLowerCase()).filter(Boolean);

  const properties = await findProperties({
    city: input.city,
    locality: input.locality,
    maxPrice: input.maxPrice,
    bedrooms: input.bedrooms,
    limit: 50,
  });

  // Amenity names per property, from Neo4j when available.
  const amenityNames = new Map<string, string[]>();
  let rankingSource: 'neo4j' | 'sql-fallback' = 'sql-fallback';

  if (wanted.length && properties.length) {
    try {
      const session = getNeo4jDriver().session();
      try {
        const result = await session.run(
          `UNWIND $ids AS propertyId
           MATCH (p:Property {id: propertyId})
           OPTIONAL MATCH (p)-[:HAS_AMENITY]->(a:Amenity)
           WITH p, collect(a.name) AS names
           RETURN p.id AS id, names`,
          { ids: properties.map((p) => p.id) }
        );
        for (const record of result.records) {
          amenityNames.set(record.get('id') as string, record.get('names') as string[]);
        }
        rankingSource = 'neo4j';
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error('Neo4j unavailable; using PostgreSQL amenity data:', error instanceof Error ? error.message : error);
    }
  }

  const terms = input.query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);

  const ranked = properties
    .map((p) => {
      const names = amenityNames.get(p.id) ?? p.amenities.map((a) => a.amenity.name);
      const matchedAmenities = names.filter((n) => wanted.includes(n.toLowerCase()));
      const amenityScore = wanted.length ? matchedAmenities.length / wanted.length : 0;

      const text = `${p.title} ${p.description} ${p.locality} ${p.city} ${names.join(' ')}`.toLowerCase();
      const keywordScore = terms.length ? terms.filter((t) => text.includes(t)).length / terms.length : 0;

      const score = wanted.length
        ? Math.round((0.6 * amenityScore + 0.4 * keywordScore) * 100)
        : Math.round(keywordScore * 100);

      const matchReasons: string[] = [];
      if (matchedAmenities.length) {
        matchReasons.push(
          `${rankingSource === 'neo4j' ? 'Graph' : 'Amenity'} match: ${matchedAmenities.join(', ')} (${matchedAmenities.length}/${wanted.length})`
        );
      }
      if (keywordScore > 0) matchReasons.push('Description contains related search terms');

      return { ...p, matchScore: score, matchReasons };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  return NextResponse.json({
    count: ranked.length,
    results: ranked,
    ranking: wanted.length ? rankingSource : 'keyword-only',
    note: 'Hybrid ranking: SQL filters + Neo4j amenity graph + keyword relevance. Embedding-based semantic search is a future extension.',
  });
}
