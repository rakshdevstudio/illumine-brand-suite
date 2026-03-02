
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS slug text;

-- Generate slugs from existing names
UPDATE public.classes SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'));

-- Make slug not null after populating
ALTER TABLE public.classes ALTER COLUMN slug SET NOT NULL;

-- Add unique constraint per school
ALTER TABLE public.classes ADD CONSTRAINT classes_school_slug_unique UNIQUE (school_id, slug);
