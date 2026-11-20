# Semantic Real Estate Matchmaker (raw SQL + two-way Neo4j sync)

Next.js app. **PostgreSQL** (plain SQL, `pg` driver, no ORM) stores the records; **Neo4j** (Cypher)
stores the relationship graph. The two are kept in sync **in both directions** by a watcher.
The laptops are connected through **Tailscale** (default, free, no card) or an **ngrok TCP tunnel** (`-Mode ngrok`).

```
 YOUR LAPTOP                                     TEAMMATE LAPTOP
 PostgreSQL :5432                                Neo4j :7687  <-- ngrok tcp 7687
 Next.js app :3000                                   ^
 sync watcher  ------ bolt://X.tcp.ngrok.io:PORT ----+
```

## Files

| Path | Purpose |
|---|---|
| `sql/schema.sql` | CREATE TYPE / TABLE / INDEX, FKs, triggers (updatedAt + change notification), sync tables |
| `sql/seed.sql` | 8 sample listings as plain `INSERT ... ON CONFLICT DO NOTHING` |
| `sql/reset.sql` | drops everything (demo DB only) |
| `lib/db.ts`, `lib/queries.ts` | pool, transactions, hand-written SQL (JOIN + `json_agg`) |
| `lib/sync-core.ts` | the two-way sync algorithm (SQL + Cypher) |
| `scripts/sync-watch.ts` | long-running watcher (`npm run sync:watch`) |
| `demo/` | demo-queries.sql / demo-queries.cypher for the viva |

## Setup (both Windows, Docker Desktop running on both)

### 1. Teammate laptop - Neo4j + ngrok
1. Create a free account at https://ngrok.com and copy the authtoken from the dashboard.
   TCP tunnels may require the account to be verified (card on file; the free plan is not charged).
2. Copy `setup-neo4j-device.ps1` and `run-neo4j-setup.bat` (also in `teammate-neo4j-setup.zip`) to a folder, double-click the `.bat`.
   It starts Neo4j, installs ngrok with winget if missing, opens the tunnel, and prints
   `bolt://0.tcp.in.ngrok.io:12345` (also copied to clipboard and saved in `neo4j-uri.txt`).
3. Send that address to you. Keep Docker and the minimized ngrok window open.

### 2. Your laptop - PostgreSQL + app + watcher
1. Unzip the project, double-click `run-postgres-setup.bat`, paste the address.
   It starts Postgres, writes `.env`, runs `npm install`, runs `sql/schema.sql` + `sql/seed.sql`, does the first sync, and checks both connections.
2. Double-click `start-all.bat` (opens the watcher and the web app). Open http://localhost:3000.

The free ngrok address changes whenever ngrok restarts: get the new one and run `run-postgres-setup.bat` again (it is safe to re-run), then restart `start-all.bat`.

## How the two-way sync works

* **PostgreSQL -> Neo4j (instant):** triggers on `"Property"` / `"PropertyAmenity"` run `pg_notify('property_changed', id)`; the watcher `LISTEN`s and syncs within ~0.4 s. Works for the web form, psql, pgAdmin, anything.
* **Neo4j -> PostgreSQL (polled every 5 s):** Neo4j cannot push events, so the watcher reads all `:Property` nodes (with amenities) each pass.
* **Change detection:** each property has a fingerprint hash. Table `"SyncState"` stores the last hash both sides agreed on, so the watcher can tell *new* from *deleted* and *which side changed*:

| Situation | Result |
|---|---|
| new in PG / new in Neo4j | copied to the other side |
| changed on one side | copied to the other side |
| deleted on one side | deleted on the other |
| changed on both sides between passes | **conflict: PostgreSQL wins**, logged as `CONFLICT` |
| one whole side suddenly empty | treated as a reset: rebuilt from the other side, not mass-deleted |

* Nodes made by hand in Neo4j Browser (even with no `id`, price, etc.) get an id and safe defaults, then appear in PostgreSQL.
* Synced fields: title, description, city, locality, price, bedrooms, bathrooms, areaSqFt, propertyType, listingType, status, amenities. `address`, `latitude`, `longitude`, `imageUrl`, owner stay PostgreSQL-only.
* Every action is written to `"SyncLog"` (last events shown on the home page, `GET /api/sync`).
* If Neo4j/ngrok is down, the app keeps working (search falls back to SQL); the watcher retries and catches up automatically.

## Demo script
1. Teammate: `MATCH (n) RETURN n`. You: `/search` with amenities `Metro, Garden` -> "Neo4j graph + keywords".
2. `/add-property` -> save -> teammate refreshes -> new node.
3. In psql run section 10 of `demo/demo-queries.sql` (insert, update, delete) and watch the graph follow.
4. Teammate runs `CREATE (p:Property {title:'Created in Neo4j', city:'Bengaluru', locality:'Hebbal', price:5500000, bedrooms:2})` -> within ~5 s `SELECT * FROM "Property"` shows it.
5. Teammate closes ngrok -> search still works (amber badge); reopen, send new address, rerun setup; changes made meanwhile sync.

Viva line: *"PostgreSQL holds the records via hand-written SQL (DDL files, triggers, transactions). Neo4j holds relationships via Cypher. A watcher reconciles them both ways using LISTEN/NOTIFY and a three-way hash comparison, over an ngrok TCP tunnel."*

## Commands

| Command | What it does |
|---|---|
| `npm run db:setup` | schema.sql + seed.sql + first sync |
| `npm run db:schema` / `db:seed` / `db:reset` | run one SQL file / wipe and rebuild |
| `npm run sync:watch` | two-way watcher |
| `npm run sync:once` | one full sync pass and exit |
| `npm run check` | test both connections |
| `npm run dev` | web app on 0.0.0.0:3000 |

## Security note
The ngrok TCP address is public and protected only by the Neo4j password (`password123`). Change it (`NEO4J_AUTH` in the compose file and `.env`) if the tunnel stays up beyond the demo, and close ngrok afterwards.

## Website demo map (for the viva)
| Demo step | Where |
|---|---|
| INSERT | `/add-property` form |
| UPDATE / DELETE | `/manage` table: Update and Delete buttons |
| JOIN | `/manage` Amenities column + "Show the JOIN query"; also `/search` results |
| TRIGGER `trg_price_audit` | change a price on `/manage` -> row appears in "Price audit log" |
| DDL / DML code | `sql/schema.sql` (CREATE TABLE, ALTER via demo), `sql/seed.sql` (INSERT), `app/api/properties/[id]/route.ts` (UPDATE, DELETE) |
