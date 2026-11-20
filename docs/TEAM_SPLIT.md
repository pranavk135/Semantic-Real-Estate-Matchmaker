# Suggested two-member implementation split

## Member 1 – PostgreSQL and API
- Own sql/schema.sql, seed.sql, relational constraints and indexes.
- Implement property/user/preference/saved-property APIs.
- Implement SQL queries, views, transactions and triggers (where appropriate).
- Own validation, integrity and PostgreSQL tests.

## Member 2 – Neo4j and UI
- Own graph model, Neo4j setup, Cypher queries and graph synchronization review.
- Implement graph-based recommendation and ranking improvements.
- Own Next.js search, results and property forms.
- Add embedding/vector search only if the team chooses that extension.

## Shared
- Agree on property IDs and API contracts before parallel work.
- Member 1 reviews the UI integration; Member 2 reviews database and graph integration.
- Both contribute commits to schema, integration, testing and documentation.
