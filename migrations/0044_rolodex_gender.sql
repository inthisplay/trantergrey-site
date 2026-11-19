-- Preserve ambiguous legacy wording rather than infer a gender.
UPDATE rolodex_people
SET notes = notes || CASE WHEN notes = '' THEN '' ELSE char(10) || char(10) END || 'Original gender entry: ' || gender
WHERE lower(trim(gender)) NOT IN ('', 'male', 'female', 'boy', 'girl', 'n/a');

UPDATE rolodex_people
SET gender = CASE lower(trim(gender))
 WHEN 'male' THEN 'Male' WHEN 'boy' THEN 'Male'
 WHEN 'female' THEN 'Female' WHEN 'girl' THEN 'Female'
 ELSE 'N/A' END;
