// =====================================================================
//  Neo4j (Cypher) DEMO QUERIES  -  Semantic Real Estate Matchmaker
//  Run on the TEAMMATE's laptop:
//     Browser : http://localhost:7474   (login neo4j / password123)
//     or shell: docker exec -it realestate-neo4j cypher-shell -u neo4j -p password123
//  In Neo4j Browser run ONE statement at a time (select it, Ctrl+Enter).
//
//  Graph model:
//     (:Property {id,title,price,city,locality,bedrooms,status,description})
//     (:Locality {name,city})
//     (:Amenity  {name})
//     (:Property)-[:LOCATED_IN]->(:Locality)
//     (:Property)-[:HAS_AMENITY]->(:Amenity)
//  PostgreSQL = source of truth, Neo4j = relationship projection.
// =====================================================================


// ---------------------------------------------------------------------
// 0. INSPECT
// ---------------------------------------------------------------------
// Whole graph (the visual for the demo)
MATCH (n) RETURN n LIMIT 100;

// Schema picture: node labels and relationship types
CALL db.schema.visualization();

// Counts per label
MATCH (n) RETURN labels(n) AS label, count(*) AS total ORDER BY total DESC;

// Counts per relationship type
MATCH ()-[r]->() RETURN type(r) AS relationship, count(*) AS total;

SHOW CONSTRAINTS;
SHOW INDEXES;


// ---------------------------------------------------------------------
// 1. READ  (MATCH ... RETURN)
// ---------------------------------------------------------------------
// 1.1 All properties
MATCH (p:Property) RETURN p.title, p.locality, p.price, p.bedrooms ORDER BY p.price;

// 1.2 Filter (same as SQL WHERE)
MATCH (p:Property)
WHERE p.city = 'Bengaluru' AND p.price <= 8000000 AND p.bedrooms = 2
RETURN p.title, p.locality, p.price
ORDER BY p.price;

// 1.3 Amenities of ONE property (graph traversal, no JOIN)
MATCH (p:Property {title: 'Bright 2BHK near Whitefield Metro'})-[:HAS_AMENITY]->(a:Amenity)
RETURN p.title, collect(a.name) AS amenities;

// 1.4 Properties in a locality
MATCH (p:Property)-[:LOCATED_IN]->(l:Locality {name: 'Whitefield'})
RETURN l.name AS locality, p.title, p.price;

// 1.5 Properties that have BOTH Metro and Garden (compare with SQL relational division)
MATCH (p:Property)-[:HAS_AMENITY]->(:Amenity {name: 'Metro'})
MATCH (p)-[:HAS_AMENITY]->(:Amenity {name: 'Garden'})
RETURN p.title, p.locality, p.price;

// 1.6 Match score for requested amenities  (this is the ranking idea used by the app)
WITH ['Metro', 'Garden', 'Parking'] AS wanted
MATCH (p:Property)-[:HAS_AMENITY]->(a:Amenity)
WHERE a.name IN wanted
WITH p, wanted, collect(DISTINCT a.name) AS matchedNames
RETURN p.title, matchedNames,
       size(matchedNames) AS matched, size(wanted) AS requested,
       round(100.0 * size(matchedNames) / size(wanted)) AS amenityScorePercent
ORDER BY matched DESC, p.price;


// ---------------------------------------------------------------------
// 2. GRAPH-ONLY QUESTIONS  (hard in SQL, natural in a graph)
// ---------------------------------------------------------------------
// 2.1 "Similar properties": share the most amenities with a given property
MATCH (p:Property {title: 'Bright 2BHK near Whitefield Metro'})-[:HAS_AMENITY]->(a:Amenity)<-[:HAS_AMENITY]-(other:Property)
WHERE other <> p
RETURN other.title, other.locality,
       collect(a.name) AS sharedAmenities, count(a) AS sharedCount
ORDER BY sharedCount DESC;

// 2.2 Shortest path between two properties (through shared amenities / localities)
MATCH (a:Property {title: 'Bright 2BHK near Whitefield Metro'}),
      (b:Property {title: 'Affordable 2BHK in Electronic City'})
MATCH path = shortestPath((a)-[*..6]-(b))
RETURN path;

// 2.3 Most popular amenities
MATCH (a:Amenity)<-[:HAS_AMENITY]-(p:Property)
RETURN a.name AS amenity, count(p) AS properties
ORDER BY properties DESC;

// 2.4 Average price and listing count per locality
MATCH (p:Property)-[:LOCATED_IN]->(l:Locality)
RETURN l.name AS locality, count(p) AS listings, round(avg(p.price)) AS avgPrice
ORDER BY avgPrice DESC;

// 2.5 Amenities that exist in a locality (2-hop path: Locality <- Property -> Amenity)
MATCH (l:Locality {name: 'Whitefield'})<-[:LOCATED_IN]-(p:Property)-[:HAS_AMENITY]->(a:Amenity)
RETURN l.name, collect(DISTINCT a.name) AS amenitiesAvailable;

// 2.6 Properties that have NO amenities at all
MATCH (p:Property) WHERE NOT (p)-[:HAS_AMENITY]->() RETURN p.title;


// ---------------------------------------------------------------------
// 3. CREATE / UPDATE / DELETE
// ---------------------------------------------------------------------
// 3.1 CREATE a property with its locality and amenities (MERGE = create only if missing)
MERGE (p:Property {id: 'demo_cypher_1'})
SET p.title = 'Cypher Demo 2BHK', p.price = 7000000, p.city = 'Bengaluru',
    p.locality = 'Whitefield', p.bedrooms = 2, p.status = 'AVAILABLE'
MERGE (l:Locality {name: 'Whitefield', city: 'Bengaluru'})
MERGE (p)-[:LOCATED_IN]->(l)
MERGE (m:Amenity {name: 'Metro'})
MERGE (g:Amenity {name: 'Garden'})
MERGE (p)-[:HAS_AMENITY]->(m)
MERGE (p)-[:HAS_AMENITY]->(g)
RETURN p, l, m, g;

// 3.2 UPDATE properties
MATCH (p:Property {id: 'demo_cypher_1'}) SET p.price = 6800000, p.status = 'UNDER_REVIEW' RETURN p;

// 3.3 ADD a relationship
MATCH (p:Property {id: 'demo_cypher_1'})
MERGE (a:Amenity {name: 'Gym'})
MERGE (p)-[:HAS_AMENITY]->(a)
RETURN p, a;

// 3.4 REMOVE a relationship
MATCH (:Property {id: 'demo_cypher_1'})-[r:HAS_AMENITY]->(:Amenity {name: 'Gym'}) DELETE r;

// 3.5 REMOVE a property (DETACH DELETE also removes its relationships)
MATCH (p:Property {id: 'demo_cypher_1'}) DETACH DELETE p;


// ---------------------------------------------------------------------
// 4. CONSTRAINTS / INDEXES / PERFORMANCE
// ---------------------------------------------------------------------
CREATE INDEX property_city IF NOT EXISTS FOR (p:Property) ON (p.city);
SHOW INDEXES;

// Execution plan with db hits
PROFILE MATCH (p:Property {city: 'Bengaluru'}) RETURN p.title;

// Uniqueness constraint violation demo: this SHOULD FAIL because the id already exists
// (first copy any real id from:  MATCH (p:Property) RETURN p.id LIMIT 1)
// CREATE (:Property {id: '<paste real id here>'});


// ---------------------------------------------------------------------
// 5. TWO-WAY SYNC WITH POSTGRESQL (the watcher runs on the Postgres laptop)
// ---------------------------------------------------------------------
// Neo4j -> PostgreSQL: create a node with only a few properties. Within ~5 seconds the
// watcher gives it an id if missing, fills defaults, and inserts it into PostgreSQL.
CREATE (p:Property {title: 'Created in Neo4j', city: 'Bengaluru', locality: 'Hebbal', price: 5500000, bedrooms: 2});
// Add an amenity relationship - it also flows to PostgreSQL ("PropertyAmenity"):
MATCH (p:Property {title: 'Created in Neo4j'}) MERGE (a:Amenity {name: 'Gym'}) MERGE (p)-[:HAS_AMENITY]->(a);
// PostgreSQL -> Neo4j: insert/update/delete rows in psql and refresh this query:
MATCH (p:Property) RETURN p.title, p.price, p.id ORDER BY p.updatedAt DESC LIMIT 5;
// Deleting a synced node deletes the row in PostgreSQL as well:
MATCH (p:Property {title: 'Created in Neo4j'}) DETACH DELETE p;
// If both sides change the same property between two sync passes, PostgreSQL wins.


// ---------------------------------------------------------------------
// 6. CLEAN UP
// ---------------------------------------------------------------------
MATCH (p:Property) WHERE p.id STARTS WITH 'demo_' OR p.title = 'Created in Neo4j' DETACH DELETE p;
// remove amenities that nothing uses any more
MATCH (a:Amenity) WHERE NOT (a)<-[:HAS_AMENITY]-() DELETE a;
