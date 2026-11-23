-- Retain original birthdays while exposing less precise casting ages.
ALTER TABLE rolodex_people ADD COLUMN age INTEGER CHECK(age IS NULL OR age BETWEEN 0 AND 130);
ALTER TABLE rolodex_people ADD COLUMN age_as_of_year INTEGER CHECK(age_as_of_year IS NULL OR age_as_of_year BETWEEN 1900 AND 9999);
ALTER TABLE rolodex_people ADD COLUMN birth_year INTEGER CHECK(birth_year IS NULL OR birth_year BETWEEN 1900 AND 9999);
UPDATE rolodex_people SET birth_year=CAST(substr(birthday,1,4) AS INTEGER) WHERE birthday IS NOT NULL;
