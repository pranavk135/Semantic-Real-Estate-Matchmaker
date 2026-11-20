1. Copy this folder's contents over your project (same paths; overwrites lib/queries.ts, app/layout.tsx, app/globals.css, app/manage/*, app/api/properties/*, app/api/sync/route.ts).
2. Run auth.sql in PostgreSQL (psql -d realestate -f auth.sql).
3. Optional package.json scripts: "auth:setup" not needed when using auth.sql.
4. npm run dev -> /login
