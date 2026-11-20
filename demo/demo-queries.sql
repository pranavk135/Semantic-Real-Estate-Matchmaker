-- =====================================================================
--  PostgreSQL DEMO QUERIES  -  Semantic Real Estate Matchmaker
--  Run on YOUR laptop:
--     docker exec -it realestate-postgres psql -U postgres -d realestate
--  Then paste one section at a time.  (Table/column names are CASE
--  SENSITIVE because sql/schema.sql created them with capitals -> always use "quotes")
--  Everything here is cleaned up in the last section (11).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. INSPECT THE SCHEMA (psql meta-commands)
-- ---------------------------------------------------------------------
-- list tables
\dt
-- columns, indexes, foreign keys
\d "Property"
-- enums (UserRole, PropertyStatus, ListingType)
\dT+
-- indexes
\di
SELECT COUNT(*) FROM "Property";
SELECT COUNT(*) FROM "Amenity";


-- ---------------------------------------------------------------------
-- 1. DDL  (CREATE / ALTER / DROP)
-- ---------------------------------------------------------------------
-- CREATE TABLE with PK, FK, DEFAULT, NOT NULL
CREATE TABLE "Inquiry" (
    "id"          SERIAL PRIMARY KEY,
    "propertyId"  TEXT NOT NULL REFERENCES "Property"("id") ON DELETE CASCADE,
    "visitorName" TEXT NOT NULL,
    "message"     TEXT,
    "createdAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ALTER: add column, add CHECK constraint, rename column
ALTER TABLE "Inquiry" ADD COLUMN "phone" VARCHAR(10);
ALTER TABLE "Inquiry" ADD CONSTRAINT inquiry_phone_chk CHECK ("phone" ~ '^[0-9]{10}$');
ALTER TABLE "Inquiry" RENAME COLUMN "message" TO "note";

-- CREATE INDEX
CREATE INDEX inquiry_property_idx ON "Inquiry"("propertyId");

-- Show it worked
\d "Inquiry"


-- ---------------------------------------------------------------------
-- 2. DML  (INSERT / UPDATE / DELETE)
-- ---------------------------------------------------------------------
-- NOTE: "id" and "updatedAt" have DB defaults (uuid / trigger); ids are given here only so the cleanup is easy
INSERT INTO "Property"
  ("id","title","description","city","locality","price","bedrooms","bathrooms","areaSqFt","propertyType","updatedAt")
VALUES
  ('demo_prop_1','Demo 2BHK in HSR Layout','Demo listing created from SQL for the DBMS presentation',
   'Bengaluru','HSR Layout',8500000,2,2,1100,'Apartment',NOW());

INSERT INTO "Amenity"("id","name") VALUES ('demo_am_1','Swimming Pool');

INSERT INTO "PropertyAmenity"("propertyId","amenityId") VALUES ('demo_prop_1','demo_am_1');

INSERT INTO "Inquiry"("propertyId","visitorName","note","phone")
VALUES ('demo_prop_1','Ravi','Interested in a site visit','9876543210');

-- Constraint violation demo (this SHOULD fail: phone is not 10 digits)
INSERT INTO "Inquiry"("propertyId","visitorName","phone") VALUES ('demo_prop_1','Test','123');

-- UPDATE
UPDATE "Property" SET "price" = 8200000 WHERE "id" = 'demo_prop_1';
UPDATE "Property" SET "status" = 'UNDER_REVIEW' WHERE "id" = 'demo_prop_1';

-- Foreign key demo (this SHOULD fail: property does not exist)
INSERT INTO "Inquiry"("propertyId","visitorName") VALUES ('no_such_id','Ghost');


-- ---------------------------------------------------------------------
-- 3. DQL  (SELECT)
-- ---------------------------------------------------------------------
-- 3.1 Basic filter + sort (uses the price / city indexes)
SELECT "title","locality","price","bedrooms"
FROM "Property"
WHERE "city" = 'Bengaluru' AND "price" <= 8000000 AND "bedrooms" = 2 AND "status" = 'AVAILABLE'
ORDER BY "price";

-- 3.2 Pattern matching (case-insensitive)
SELECT "title","locality" FROM "Property" WHERE "description" ILIKE '%metro%';

-- 3.3 JOIN: properties with their amenities (many-to-many through PropertyAmenity)
SELECT p."title", a."name" AS amenity
FROM "Property" p
JOIN "PropertyAmenity" pa ON pa."propertyId" = p."id"
JOIN "Amenity" a          ON a."id" = pa."amenityId"
ORDER BY p."title", a."name";

-- 3.4 GROUP BY + HAVING: properties with 3 or more amenities
SELECT p."title", COUNT(*) AS amenity_count
FROM "Property" p
JOIN "PropertyAmenity" pa ON pa."propertyId" = p."id"
GROUP BY p."id", p."title"
HAVING COUNT(*) >= 3
ORDER BY amenity_count DESC;

-- 3.5 Properties that have BOTH Metro AND Garden (relational division)
SELECT p."title"
FROM "Property" p
JOIN "PropertyAmenity" pa ON pa."propertyId" = p."id"
JOIN "Amenity" a          ON a."id" = pa."amenityId"
WHERE a."name" IN ('Metro','Garden')
GROUP BY p."id", p."title"
HAVING COUNT(DISTINCT a."name") = 2;

-- 3.6 Aggregates per locality
SELECT "locality", COUNT(*) AS listings, ROUND(AVG("price")) AS avg_price,
       MIN("price") AS cheapest, MAX("price") AS costliest
FROM "Property"
GROUP BY "locality"
ORDER BY avg_price DESC;

-- 3.7 Subquery: listings priced above the overall average
SELECT "title","price" FROM "Property"
WHERE "price" > (SELECT AVG("price") FROM "Property")
ORDER BY "price" DESC;

-- 3.8 LEFT JOIN: properties with NO inquiries
SELECT p."title"
FROM "Property" p
LEFT JOIN "Inquiry" i ON i."propertyId" = p."id"
WHERE i."id" IS NULL;

-- 3.9 Window function: rank by price within each locality
SELECT "locality","title","price",
       RANK() OVER (PARTITION BY "locality" ORDER BY "price" DESC) AS price_rank
FROM "Property";

-- 3.10 CTE (WITH): amenity popularity
WITH amenity_counts AS (
    SELECT a."name", COUNT(*) AS used_in
    FROM "Amenity" a JOIN "PropertyAmenity" pa ON pa."amenityId" = a."id"
    GROUP BY a."name"
)
SELECT * FROM amenity_counts ORDER BY used_in DESC;

-- 3.11 Query plan - show the index being used
EXPLAIN ANALYZE SELECT * FROM "Property" WHERE "price" <= 8000000;


-- ---------------------------------------------------------------------
-- 4. VIEW
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW available_listings AS
SELECT p."id", p."title", p."city", p."locality", p."price", p."bedrooms",
       STRING_AGG(a."name", ', ' ORDER BY a."name") AS amenities
FROM "Property" p
LEFT JOIN "PropertyAmenity" pa ON pa."propertyId" = p."id"
LEFT JOIN "Amenity" a          ON a."id" = pa."amenityId"
WHERE p."status" = 'AVAILABLE'
GROUP BY p."id";

SELECT * FROM available_listings WHERE "price" < 9000000;


-- ---------------------------------------------------------------------
-- 5. STORED FUNCTION
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_by_budget(max_price INT, min_beds INT)
RETURNS TABLE(title TEXT, locality TEXT, price INT) AS $$
    SELECT "title", "locality", "price"
    FROM "Property"
    WHERE "price" <= max_price AND "bedrooms" >= min_beds AND "status" = 'AVAILABLE'
    ORDER BY "price";
$$ LANGUAGE sql;

SELECT * FROM search_by_budget(8000000, 2);


-- ---------------------------------------------------------------------
-- 6. TRIGGER  (automatic price-change audit log)
-- ---------------------------------------------------------------------
-- The table "PriceAudit", function log_price_change() and trigger trg_price_audit already exist (sql/schema.sql).
-- \sf log_price_change   shows the function;  \d "Property"  lists the trigger.

-- Fire it:
UPDATE "Property" SET "price" = 8000000 WHERE "id" = 'demo_prop_1';
SELECT * FROM "PriceAudit";


-- ---------------------------------------------------------------------
-- 7. TCL  (transactions: BEGIN / SAVEPOINT / ROLLBACK / COMMIT)
-- ---------------------------------------------------------------------
-- 7.1 Rollback: nothing is saved
BEGIN;
UPDATE "Property" SET "price" = 1 WHERE "id" = 'demo_prop_1';
SELECT "price" FROM "Property" WHERE "id" = 'demo_prop_1';   -- shows 1 inside the transaction
ROLLBACK;
SELECT "price" FROM "Property" WHERE "id" = 'demo_prop_1';   -- back to 8000000

-- 7.2 Savepoint
BEGIN;
UPDATE "Property" SET "price" = 8100000 WHERE "id" = 'demo_prop_1';
SAVEPOINT after_first_update;
UPDATE "Property" SET "price" = 1 WHERE "id" = 'demo_prop_1';
ROLLBACK TO SAVEPOINT after_first_update;                    -- undo only the second update
COMMIT;
SELECT "price" FROM "Property" WHERE "id" = 'demo_prop_1';   -- 8100000


-- ---------------------------------------------------------------------
-- 8. DCL  (users, GRANT / REVOKE)
-- ---------------------------------------------------------------------
CREATE ROLE demo_viewer LOGIN PASSWORD 'viewer123';
GRANT SELECT ON "Property", "Amenity", "PropertyAmenity" TO demo_viewer;

-- Prove it: open a 2nd terminal and run
--   docker exec -it realestate-postgres psql -U demo_viewer -d realestate
--   SELECT COUNT(*) FROM "Property";                  -- works
--   DELETE FROM "Property";                           -- ERROR: permission denied

REVOKE SELECT ON "Property" FROM demo_viewer;
-- show privileges
\dp "Property"


-- ---------------------------------------------------------------------
-- 9. INTEGRITY DEMOS (first one fails on purpose, second shows CASCADE)
-- ---------------------------------------------------------------------
INSERT INTO "Amenity"("id","name") VALUES ('dup_test','Swimming Pool');   -- UNIQUE(name) violation
DELETE FROM "Property" WHERE "id" = 'demo_prop_1';    -- ON DELETE CASCADE removes its PropertyAmenity + Inquiry rows (this one works)
SELECT COUNT(*) FROM "Inquiry" WHERE "propertyId" = 'demo_prop_1';        -- 0


-- ---------------------------------------------------------------------
-- 10. TWO-WAY SYNC DEMO (needs `npm run sync:watch` running)
-- ---------------------------------------------------------------------
-- Any SQL write fires the NOTIFY trigger -> the watcher copies it to Neo4j in about a second.
INSERT INTO "Property"("id","title","description","city","locality","price","bedrooms","bathrooms","areaSqFt","propertyType")
VALUES ('demo_sync_1','Sync Demo 2BHK','Inserted in SQL, should appear in Neo4j by itself','Bengaluru','Whitefield',7000000,2,2,1000,'Apartment');
-- Teammate checks:  MATCH (p:Property {id:'demo_sync_1'}) RETURN p;
UPDATE "Property" SET "price" = 6900000 WHERE "id" = 'demo_sync_1';   -- price changes in Neo4j too
-- Now the other direction: teammate runs in Neo4j
--   MATCH (p:Property {id:'demo_sync_1'}) SET p.price = 6500000;
-- wait ~5 seconds, then:
SELECT "price" FROM "Property" WHERE "id" = 'demo_sync_1';            -- 6500000
SELECT "at","direction","action","title" FROM "SyncLog" ORDER BY "id" DESC LIMIT 5;
DELETE FROM "Property" WHERE "id" = 'demo_sync_1';                    -- node disappears from Neo4j


-- ---------------------------------------------------------------------
-- 11. CLEAN UP  (run after the demo)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS search_by_budget(INT, INT);
DROP VIEW     IF EXISTS available_listings;
DROP TABLE    IF EXISTS "Inquiry";
DELETE FROM "PropertyAmenity" WHERE "amenityId" = 'demo_am_1';
DELETE FROM "Amenity"  WHERE "id" = 'demo_am_1';
DELETE FROM "Property" WHERE "id" = 'demo_prop_1';
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM demo_viewer;
DROP ROLE IF EXISTS demo_viewer;
