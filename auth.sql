-- auth.sql: run once (safe to re-run)
CREATE TABLE IF NOT EXISTS "Session" (
    "tokenHash" TEXT PRIMARY KEY,
    "userId"    TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expiresAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS session_user_idx ON "Session"("userId");

-- demo accounts (scrypt hashes, same format the app verifies)
INSERT INTO "User"("name","email","passwordHash","role") VALUES ('Admin','admin@realestate.com','89655dde8536ccb243408275a6ad9691:9adaf63618d4ef269c18cf8dc139fa408f00fed596f443465d56b1513332d0bf30893195ef7b4ab080e4c1a83bee33f2531700c94eeb7ef600e0b4d1ccedc923','ADMIN')
ON CONFLICT ("email") DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash","role"=EXCLUDED."role";
INSERT INTO "User"("name","email","passwordHash","role") VALUES ('Agent','agent@realestate.com','a6f8fac284abf6b9509a85050e6a4aee:b7b2c1ee5984e308c5d1f2c142993bd8a5678c3374797a61ba9f1b133ff2165e60d89325fb9d6d3e8196eb3d10d16d49db0d23124d1618c8dd10ab31d06ab056','AGENT')
ON CONFLICT ("email") DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash","role"=EXCLUDED."role";
INSERT INTO "User"("name","email","passwordHash","role") VALUES ('User','user@realestate.com','fba08084068b65c0564a33e3852cfcfb:67b9846c828b600808c75cccd547c872beb81974c1853d3dfc63b18547438dc1e630b61ceeb99442a5eb2887fe2afee47f264c23d6a2bcd2d33bbb07498dc7e0','USER')
ON CONFLICT ("email") DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash","role"=EXCLUDED."role";

-- give unowned listings to the agent
UPDATE "Property" SET "ownerId"=(SELECT "id" FROM "User" WHERE "email"='agent@realestate.com') WHERE "ownerId" IS NULL;
