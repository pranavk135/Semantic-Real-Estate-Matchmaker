-- =====================================================================
--  schema.sql  -  Semantic Real Estate Matchmaker  (PostgreSQL 16)
--  Plain SQL. Safe to re-run (everything is IF NOT EXISTS / OR REPLACE).
--  Run with:  npm run db:schema
-- =====================================================================

-- ---------- ENUM TYPES ----------
DO $$ BEGIN CREATE TYPE "UserRole"       AS ENUM ('USER','AGENT','ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PropertyStatus" AS ENUM ('AVAILABLE','UNDER_REVIEW','SOLD','RENTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ListingType"    AS ENUM ('SALE','RENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- TABLES ----------
CREATE TABLE IF NOT EXISTS "User" (
    "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "name"         TEXT NOT NULL,
    "email"        TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT,
    "role"         "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Property" (
    "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "title"        TEXT NOT NULL,
    "description"  TEXT NOT NULL,
    "city"         TEXT NOT NULL,
    "locality"     TEXT NOT NULL,
    "address"      TEXT,
    "price"        INTEGER NOT NULL CHECK ("price" >= 0),
    "bedrooms"     INTEGER NOT NULL CHECK ("bedrooms" >= 0),
    "bathrooms"    INTEGER NOT NULL CHECK ("bathrooms" >= 0),
    "areaSqFt"     INTEGER NOT NULL CHECK ("areaSqFt" >= 0),
    "propertyType" TEXT NOT NULL,
    "listingType"  "ListingType"    NOT NULL DEFAULT 'SALE',
    "status"       "PropertyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "latitude"     DOUBLE PRECISION,
    "longitude"    DOUBLE PRECISION,
    "imageUrl"     TEXT,
    "ownerId"      TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Amenity" (
    "id"   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS "PropertyAmenity" (
    "propertyId" TEXT NOT NULL REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "amenityId"  TEXT NOT NULL REFERENCES "Amenity"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("propertyId","amenityId")
);

CREATE TABLE IF NOT EXISTS "Preference" (
    "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId"           TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "city"             TEXT,
    "maxPrice"         INTEGER,
    "minBedrooms"      INTEGER,
    "maxBedrooms"      INTEGER,
    "desiredAmenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SavedProperty" (
    "userId"     TEXT NOT NULL REFERENCES "User"("id")     ON DELETE CASCADE ON UPDATE CASCADE,
    "propertyId" TEXT NOT NULL REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId","propertyId")
);

CREATE TABLE IF NOT EXISTS "SearchHistory" (
    "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId"    TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "query"     TEXT NOT NULL,
    "filters"   JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- SYNC BOOKKEEPING (PostgreSQL <-> Neo4j) ----------
-- SyncState: the fingerprint both databases agreed on the last time they were in sync.
--            No foreign key on purpose: it must survive a Property delete so the
--            watcher can tell "deleted" apart from "never synced".
CREATE TABLE IF NOT EXISTS "SyncState" (
    "propertyId" TEXT PRIMARY KEY,
    "hash"       TEXT NOT NULL,
    "syncedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SyncLog: human-readable audit trail, shown on the home page and handy in the viva.
CREATE TABLE IF NOT EXISTS "SyncLog" (
    "id"         SERIAL PRIMARY KEY,
    "at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyId" TEXT,
    "title"      TEXT,
    "direction"  TEXT NOT NULL,   -- 'PG->NEO' | 'NEO->PG' | 'SYSTEM'
    "action"     TEXT NOT NULL,   -- CREATE | UPDATE | DELETE | CONFLICT | WARN
    "detail"     TEXT
);

-- ---------- INDEXES ----------
CREATE INDEX IF NOT EXISTS "Property_city_locality_idx"      ON "Property"("city","locality");
CREATE INDEX IF NOT EXISTS "Property_price_idx"              ON "Property"("price");
CREATE INDEX IF NOT EXISTS "Property_bedrooms_status_idx"    ON "Property"("bedrooms","status");
CREATE INDEX IF NOT EXISTS "Property_status_listingType_idx" ON "Property"("status","listingType");
CREATE INDEX IF NOT EXISTS "PropertyAmenity_amenityId_idx"   ON "PropertyAmenity"("amenityId");
CREATE INDEX IF NOT EXISTS "SearchHistory_createdAt_idx"     ON "SearchHistory"("createdAt");
CREATE INDEX IF NOT EXISTS "SyncLog_at_idx"                  ON "SyncLog"("at" DESC);

-- ---------- TRIGGER 1: keep "updatedAt" correct (replaces Prisma's @updatedAt) ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_property_updated   ON "Property";
CREATE TRIGGER trg_property_updated   BEFORE UPDATE ON "Property"   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_user_updated       ON "User";
CREATE TRIGGER trg_user_updated       BEFORE UPDATE ON "User"       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_preference_updated ON "Preference";
CREATE TRIGGER trg_preference_updated BEFORE UPDATE ON "Preference" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- TRIGGER 2: tell the sync watcher that a property changed ----------
-- Any INSERT/UPDATE/DELETE on Property or PropertyAmenity (from the web form, psql,
-- pgAdmin, anything) fires NOTIFY 'property_changed'. The watcher LISTENs on it.
CREATE OR REPLACE FUNCTION notify_property_change() RETURNS TRIGGER AS $$
DECLARE pid TEXT;
BEGIN
    IF TG_TABLE_NAME = 'Property' THEN
        pid := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
    ELSE
        pid := CASE WHEN TG_OP = 'DELETE' THEN OLD."propertyId" ELSE NEW."propertyId" END;
    END IF;
    PERFORM pg_notify('property_changed', pid);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_property_notify ON "Property";
CREATE TRIGGER trg_property_notify
AFTER INSERT OR UPDATE OR DELETE ON "Property"
FOR EACH ROW EXECUTE FUNCTION notify_property_change();

DROP TRIGGER IF EXISTS trg_propertyamenity_notify ON "PropertyAmenity";
CREATE TRIGGER trg_propertyamenity_notify
AFTER INSERT OR DELETE ON "PropertyAmenity"
FOR EACH ROW EXECUTE FUNCTION notify_property_change();

-- ---------- TRIGGER 3: price audit (shown on the /manage page) ----------
CREATE TABLE IF NOT EXISTS "PriceAudit" (
    "id"         SERIAL PRIMARY KEY,
    "propertyId" TEXT NOT NULL REFERENCES "Property"("id") ON DELETE CASCADE,
    "oldPrice"   INTEGER,
    "newPrice"   INTEGER,
    "changedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION log_price_change() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "PriceAudit"("propertyId","oldPrice","newPrice")
    VALUES (OLD."id", OLD."price", NEW."price");
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_price_audit ON "Property";
CREATE TRIGGER trg_price_audit
AFTER UPDATE OF "price" ON "Property"
FOR EACH ROW WHEN (OLD."price" IS DISTINCT FROM NEW."price")
EXECUTE FUNCTION log_price_change();
