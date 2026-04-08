-- Critical integrity hardening for products metadata used by inventory reporting.
-- This migration:
-- 1) Audits null relational fields.
-- 2) Backfills missing school/class/gender deterministically.
-- 3) Enforces NOT NULL + valid gender check to prevent future corruption.

-- Audit reference queries:
-- SELECT id, name, school_id, class_id, gender
-- FROM public.products
-- WHERE school_id IS NULL OR class_id IS NULL OR gender IS NULL;
--
-- SELECT COUNT(*)
-- FROM public.products
-- WHERE school_id IS NULL OR class_id IS NULL OR gender IS NULL;

DO $$
DECLARE
  v_fallback_school_id uuid;
  v_fallback_class_id uuid;
BEGIN
  -- Resolve fallback school (prefer Global School, else first school by name).
  SELECT s.id
    INTO v_fallback_school_id
  FROM public.schools s
  WHERE lower(s.name) = 'global school'
  ORDER BY s.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_fallback_school_id IS NULL THEN
    SELECT s.id
      INTO v_fallback_school_id
    FROM public.schools s
    ORDER BY s.name ASC
    LIMIT 1;
  END IF;

  IF v_fallback_school_id IS NULL THEN
    RAISE EXCEPTION 'Cannot backfill products.school_id: no schools found';
  END IF;

  -- Resolve fallback class (prefer Class 1 in fallback school, else first class in fallback school, else first class globally).
  SELECT c.id
    INTO v_fallback_class_id
  FROM public.classes c
  WHERE c.school_id = v_fallback_school_id
    AND lower(c.name) = 'class 1'
  ORDER BY c.sort_order ASC NULLS LAST, c.name ASC
  LIMIT 1;

  IF v_fallback_class_id IS NULL THEN
    SELECT c.id
      INTO v_fallback_class_id
    FROM public.classes c
    WHERE c.school_id = v_fallback_school_id
    ORDER BY c.sort_order ASC NULLS LAST, c.name ASC
    LIMIT 1;
  END IF;

  IF v_fallback_class_id IS NULL THEN
    SELECT c.id
      INTO v_fallback_class_id
    FROM public.classes c
    ORDER BY c.sort_order ASC NULLS LAST, c.name ASC
    LIMIT 1;
  END IF;

  IF v_fallback_class_id IS NULL THEN
    RAISE EXCEPTION 'Cannot backfill products.class_id: no classes found';
  END IF;

  -- Backfill null school/class.
  UPDATE public.products
  SET school_id = v_fallback_school_id
  WHERE school_id IS NULL;

  UPDATE public.products
  SET class_id = v_fallback_class_id
  WHERE class_id IS NULL;

  -- Normalize existing gender values to canonical values.
  UPDATE public.products
  SET gender = CASE
    WHEN lower(trim(gender)) IN ('male', 'boys', 'boy', 'm') THEN 'Male'
    WHEN lower(trim(gender)) IN ('female', 'girls', 'girl', 'f') THEN 'Female'
    WHEN lower(trim(gender)) IN ('unisex', 'uni-sex', 'u') THEN 'Unisex'
    ELSE gender
  END
  WHERE gender IS NOT NULL;

  -- Heuristic repair for likely misclassified legacy catalog.
  UPDATE public.products
  SET gender = 'Female'
  WHERE (gender IS NULL OR gender = 'Unisex')
    AND (
      name ILIKE '%skirt%'
      OR name ILIKE '%bloomer%'
      OR name ILIKE '%pinafore%'
    );

  UPDATE public.products
  SET gender = 'Male'
  WHERE (gender IS NULL OR gender = 'Unisex')
    AND (
      name ILIKE '%pant%'
      OR name ILIKE '%trouser%'
    )
    AND name NOT ILIKE '%trackpant%';

  -- Final fallback for any remaining null genders.
  UPDATE public.products
  SET gender = 'Unisex'
  WHERE gender IS NULL;
END;
$$;

-- Ensure assignment table is aligned with corrected product gender when assignment was previously generic.
UPDATE public.product_assignments pa
SET gender = p.gender
FROM public.products p
WHERE pa.product_id = p.id
  AND pa.gender = 'Unisex'
  AND p.gender IN ('Male', 'Female');

-- Prevent future silent corruption.
ALTER TABLE public.products
  ALTER COLUMN school_id SET NOT NULL,
  ALTER COLUMN class_id SET NOT NULL,
  ALTER COLUMN gender SET NOT NULL;

ALTER TABLE public.products
  ALTER COLUMN gender DROP DEFAULT;

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
