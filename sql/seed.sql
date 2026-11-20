-- =====================================================================
--  seed.sql  -  8 sample listings (plain INSERTs, safe to re-run)
--  Run with:  npm run db:seed
-- =====================================================================

-- 1) Amenities (UNIQUE name -> duplicates are skipped)
INSERT INTO "Amenity" ("name") VALUES
  ('Balcony'),
  ('Garden'),
  ('Gym'),
  ('Metro'),
  ('Natural Light'),
  ('Parking'),
  ('Public Transport'),
  ('Schools'),
  ('Security')
ON CONFLICT ("name") DO NOTHING;

-- 2) Properties (fixed ids so re-running never duplicates)
INSERT INTO "Property"
  ("id","title","description","city","locality","price","bedrooms","bathrooms","areaSqFt","propertyType")
VALUES
  ('seed_prop_1','Bright 2BHK near Whitefield Metro',
   'Well ventilated apartment in a quiet residential community, a short walk from metro connectivity. Natural light, landscaped garden and covered parking.',
   'Bengaluru','Whitefield',7800000,2,2,1120,'Apartment'),
  ('seed_prop_2','Spacious 3BHK in Indiranagar',
   'Large family apartment on a peaceful tree-lined street with excellent access to restaurants, schools and public transport.',
   'Bengaluru','Indiranagar',14500000,3,3,1650,'Apartment'),
  ('seed_prop_3','Affordable 2BHK in Electronic City',
   'Budget friendly apartment in a gated community with security, gym and convenient access to IT parks.',
   'Bengaluru','Electronic City',6200000,2,2,980,'Apartment'),
  ('seed_prop_4','Quiet 2BHK with garden view',
   'Peaceful home with plenty of natural light, green views and easy access to metro and daily essentials.',
   'Bengaluru','KR Puram',7200000,2,2,1050,'Apartment'),
  ('seed_prop_5','Modern 2BHK near Koramangala schools',
   'Contemporary apartment close to reputed schools, cafes and bus routes. Balcony with a calm, leafy outlook.',
   'Bengaluru','Koramangala',9800000,2,2,1180,'Apartment'),
  ('seed_prop_6','Family 3BHK villa in Sarjapur',
   'Independent villa in a green, peaceful layout with a private garden, covered parking and round-the-clock security.',
   'Bengaluru','Sarjapur',11800000,3,3,2100,'Villa'),
  ('seed_prop_7','Compact 1BHK near Hebbal Metro',
   'Well planned studio-style home beside the metro line, ideal for working professionals. Bright rooms and secure entry.',
   'Bengaluru','Hebbal',4900000,1,1,640,'Apartment'),
  ('seed_prop_8','Sea-facing 2BHK in Adyar',
   'Airy apartment with natural light and ventilation, walking distance to parks, schools and suburban rail.',
   'Chennai','Adyar',8600000,2,2,1100,'Apartment')
ON CONFLICT ("id") DO NOTHING;

-- 3) Many-to-many links (Property <-> Amenity)
INSERT INTO "PropertyAmenity" ("propertyId","amenityId")
SELECT v.pid, a."id"
FROM (VALUES
  ('seed_prop_1','Metro'),
  ('seed_prop_1','Garden'),
  ('seed_prop_1','Parking'),
  ('seed_prop_1','Natural Light'),
  ('seed_prop_2','Public Transport'),
  ('seed_prop_2','Schools'),
  ('seed_prop_2','Balcony'),
  ('seed_prop_2','Parking'),
  ('seed_prop_3','Security'),
  ('seed_prop_3','Gym'),
  ('seed_prop_3','Parking'),
  ('seed_prop_4','Metro'),
  ('seed_prop_4','Garden'),
  ('seed_prop_4','Natural Light'),
  ('seed_prop_5','Schools'),
  ('seed_prop_5','Public Transport'),
  ('seed_prop_5','Balcony'),
  ('seed_prop_5','Gym'),
  ('seed_prop_6','Garden'),
  ('seed_prop_6','Parking'),
  ('seed_prop_6','Security'),
  ('seed_prop_6','Natural Light'),
  ('seed_prop_7','Metro'),
  ('seed_prop_7','Security'),
  ('seed_prop_7','Natural Light'),
  ('seed_prop_8','Schools'),
  ('seed_prop_8','Garden'),
  ('seed_prop_8','Public Transport'),
  ('seed_prop_8','Natural Light')
) AS v(pid, amenity)
JOIN "Amenity" a ON a."name" = v.amenity
ON CONFLICT DO NOTHING;
