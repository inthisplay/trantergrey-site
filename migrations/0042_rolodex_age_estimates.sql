-- Convert existing birth-year-derived estimates before removing that UI field.
-- Keep historical birth data intact; subsequent age edits use only age + reference year.
UPDATE rolodex_people
SET age=CAST(strftime('%Y','now') AS INTEGER)-birth_year,
    age_as_of_year=CAST(strftime('%Y','now') AS INTEGER)
WHERE age IS NULL AND birth_year IS NOT NULL
  AND CAST(strftime('%Y','now') AS INTEGER)-birth_year BETWEEN 0 AND 130;
UPDATE rolodex_people SET age_as_of_year=CAST(strftime('%Y','now') AS INTEGER)
WHERE age IS NOT NULL AND age_as_of_year IS NULL;
