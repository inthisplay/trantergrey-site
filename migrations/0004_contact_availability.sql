ALTER TABLE contact_inquiries ADD COLUMN availability_dates TEXT NOT NULL DEFAULT '[]';
ALTER TABLE contact_inquiries ADD COLUMN availability_time TEXT NOT NULL DEFAULT '';
