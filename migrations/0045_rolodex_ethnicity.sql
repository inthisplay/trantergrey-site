-- Keep legacy descriptions in Notes before replacing the selector value.
UPDATE rolodex_people
SET notes = notes || CASE WHEN notes = '' THEN '' ELSE char(10) || char(10) END || 'Original race / ethnicity entry: ' || ethnicity
WHERE trim(ethnicity) <> '' AND ethnicity NOT IN (
 'American Indian or Alaska Native', 'Asian', 'Black or African American',
 'Hispanic or Latino', 'Middle Eastern or North African', 'Native Hawaiian or Pacific Islander', 'White', 'Ambiguous'
);

UPDATE rolodex_people SET ethnicity = CASE lower(trim(ethnicity))
 WHEN 'american indian or alaska native' THEN 'American Indian or Alaska Native'
 WHEN 'asian' THEN 'Asian' WHEN 'asian/vietnamese' THEN 'Asian'
 WHEN 'black' THEN 'Black or African American' WHEN 'african american' THEN 'Black or African American' WHEN 'black or african american' THEN 'Black or African American'
 WHEN 'hispanic' THEN 'Hispanic or Latino' WHEN 'latino' THEN 'Hispanic or Latino' WHEN 'hispanic/latino' THEN 'Hispanic or Latino' WHEN 'hispanic or latino' THEN 'Hispanic or Latino'
 WHEN 'middle eastern or north african' THEN 'Middle Eastern or North African'
 WHEN 'native hawaiian or pacific islander' THEN 'Native Hawaiian or Pacific Islander'
 WHEN 'ambiguous' THEN 'Ambiguous'
 WHEN 'african american/ambiguous' THEN 'Black or African American; Ambiguous'
 WHEN 'white' THEN 'White' WHEN 'caucasian' THEN 'White'
 ELSE '' END;
