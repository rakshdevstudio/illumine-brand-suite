-- Enforce product gender integrity and fix misclassified historical data.
-- 1) Normalize existing gender values to canonical enum values.
UPDATE public.products
SET gender = CASE
  WHEN lower(trim(gender)) IN ('male', 'boys', 'boy', 'm') THEN 'Male'
  WHEN lower(trim(gender)) IN ('female', 'girls', 'girl', 'f') THEN 'Female'
  WHEN lower(trim(gender)) IN ('unisex', 'uni-sex', 'u') THEN 'Unisex'
  ELSE gender
END
WHERE gender IS NOT NULL;

-- 2) Product-name heuristic fixes for rows that are currently misclassified as Unisex.
UPDATE public.products
SET gender = 'Female'
WHERE gender = 'Unisex'
  AND (
    name ILIKE '%skirt%'
    OR name ILIKE '%bloomer%'
    OR name ILIKE '%pinafore%'
  );

UPDATE public.products
SET gender = 'Male'
WHERE gender = 'Unisex'
  AND (
    name ILIKE '%pant%'
    OR name ILIKE '%trouser%'
  )
  AND name NOT ILIKE '%trackpant%';

-- 3) Keep product assignments aligned with product-level gender for previously-unisex assignments.
UPDATE public.product_assignments pa
SET gender = p.gender
FROM public.products p
WHERE pa.product_id = p.id
  AND pa.gender = 'Unisex'
  AND p.gender IN ('Male', 'Female');

-- 4) Stop blind defaulting at DB layer; inserts must provide explicit gender.
ALTER TABLE public.products
  ALTER COLUMN gender DROP DEFAULT;

-- 5) Guarantee valid, explicit gender values going forward.
ALTER TABLE public.products
  ALTER COLUMN gender SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_gender_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_gender_check CHECK (gender IN ('Male', 'Female', 'Unisex'));
  END IF;
END;
$$;
