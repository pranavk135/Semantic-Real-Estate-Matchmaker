import type { PoolClient } from 'pg';
import { query } from './db';

export type PropertyRow = {
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
  listingType: string;
  status: string;
  createdAt: Date;
  amenities: { amenity: { name: string } }[];
};

export type PropertyFilters = {
  city?: string;
  locality?: string;
  maxPrice?: number;
  bedrooms?: number;
  limit?: number;
  allStatuses?: boolean;
  ownerId?: string;
};

/**
 * Structured search: filters + JOIN across Property -> PropertyAmenity -> Amenity.
 * Amenities come back as json_agg so the UI shape stays [{ amenity: { name } }].
 */
export async function findProperties(f: PropertyFilters): Promise<PropertyRow[]> {
  const params: unknown[] = [];
  const where: string[] = f.allStatuses ? ['TRUE'] : [`p."status" = 'AVAILABLE'`];
  const add = (sqlWithQ: string, value: unknown) => {
    params.push(value);
    where.push(sqlWithQ.replace('?', `$${params.length}`));
  };

  if (f.city) add(`p."city" ILIKE '%' || ? || '%'`, f.city);
  if (f.locality) add(`p."locality" ILIKE '%' || ? || '%'`, f.locality);
  if (f.maxPrice !== undefined) add(`p."price" <= ?`, f.maxPrice);
  if (f.bedrooms !== undefined) add(`p."bedrooms" = ?`, f.bedrooms);
  if (f.ownerId) add(`p."ownerId" = ?`, f.ownerId);

  params.push(f.limit ?? 50);
  const sql = `
    SELECT p."id", p."title", p."description", p."city", p."locality", p."price",
           p."bedrooms", p."bathrooms", p."areaSqFt", p."propertyType",
           p."listingType", p."status", p."createdAt",
           COALESCE(
             json_agg(json_build_object('amenity', json_build_object('name', a."name")) ORDER BY a."name")
               FILTER (WHERE a."name" IS NOT NULL),
             '[]'::json
           ) AS amenities
    FROM "Property" p
    LEFT JOIN "PropertyAmenity" pa ON pa."propertyId" = p."id"
    LEFT JOIN "Amenity" a          ON a."id" = pa."amenityId"
    WHERE ${where.join(' AND ')}
    GROUP BY p."id"
    ORDER BY p."createdAt" DESC
    LIMIT $${params.length}`;
  const { rows } = await query<PropertyRow>(sql, params);
  return rows;
}

/**
 * Makes the amenity links of one property exactly equal to `names`.
 * Runs on the caller's transaction client.
 */
export async function setPropertyAmenities(client: PoolClient, propertyId: string, names: string[]) {
  // 1) unlink amenities that are no longer wanted
  await client.query(
    `DELETE FROM "PropertyAmenity" pa
     USING "Amenity" a
     WHERE pa."amenityId" = a."id" AND pa."propertyId" = $1
       AND NOT (a."name" = ANY($2::text[]))`,
    [propertyId, names]
  );
  // 2) create missing amenities (UNIQUE name -> duplicates ignored)
  await client.query(
    `INSERT INTO "Amenity" ("name")
     SELECT DISTINCT unnest($1::text[])
     ON CONFLICT ("name") DO NOTHING`,
    [names]
  );
  // 3) link
  await client.query(
    `INSERT INTO "PropertyAmenity" ("propertyId","amenityId")
     SELECT $1::text, a."id" FROM "Amenity" a WHERE a."name" = ANY($2::text[])
     ON CONFLICT DO NOTHING`,
    [propertyId, names]
  );
}
