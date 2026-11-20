import { NextRequest, NextResponse } from 'next/server';
import { tx } from '@/lib/db';
import { findProperties, setPropertyAmenities } from '@/lib/queries';
import { propertySchema } from '@/lib/validation';
import { reconcile } from '@/lib/sync-core';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const maxPrice = p.get('maxPrice');
  const bedrooms = p.get('bedrooms');
  const rows = await findProperties({
    city: p.get('city') ?? undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    bedrooms: bedrooms ? Number(bedrooms) : undefined,
  });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const parsed = propertySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid property data', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  // Link each new listing to the existing USER account. BUYER is accepted
  // as USER for compatibility with databases created before role consolidation.
  const property = await tx(async (c) => {
    const users = await c.query(
      `SELECT "id" FROM "User"
       WHERE "role"::text IN ('USER', 'USER')
       ORDER BY CASE WHEN "role"::text = 'USER' THEN 0 ELSE 1 END, "createdAt"
       LIMIT 1`
    );
    if (!users.rows[0]) throw new Error('No USER account found. Create a USER account before adding a property.');
    const ownerId = users.rows[0].id;
    const { rows } = await c.query(
      `INSERT INTO "Property"
         ("title","description","city","locality","price","bedrooms","bathrooms","areaSqFt","propertyType","listingType","imageUrl","ownerId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::"ListingType",$11,$12)
       RETURNING *`,
      [d.title, d.description, d.city, d.locality, d.price, d.bedrooms, d.bathrooms,
       d.areaSqFt, d.propertyType, d.listingType, d.imageUrl || null, ownerId]
    );
    await setPropertyAmenities(c, rows[0].id, d.amenities);
    return rows[0];
  });

  // 2) Push to Neo4j right away. If it is unreachable the row stays saved and the
  //    sync watcher (npm run sync:watch) copies it as soon as Neo4j is back.
  let graphSynced = false;
  try {
    const result = await reconcile(property.id);
    graphSynced = result.errors.length === 0;
  } catch (error) {
    console.error('Neo4j sync failed:', error instanceof Error ? error.message : error);
  }

  return NextResponse.json({ ...property, amenities: d.amenities, graphSynced }, { status: 201 });
}
