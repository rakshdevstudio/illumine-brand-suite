-- Normalize store-facing product data for strict products/product_variants filtering.
-- Root cause addressed: admin lifecycle uses is_active while store filtering uses status text.

-- 1) Normalize product status from is_active.
UPDATE public.products
SET status = CASE WHEN COALESCE(is_active, true) THEN 'active' ELSE 'inactive' END
WHERE status IS DISTINCT FROM CASE WHEN COALESCE(is_active, true) THEN 'active' ELSE 'inactive' END;

-- 2) Normalize variant status from is_active.
UPDATE public.product_variants
SET status = CASE WHEN COALESCE(is_active, true) THEN 'active' ELSE 'inactive' END
WHERE status IS DISTINCT FROM CASE WHEN COALESCE(is_active, true) THEN 'active' ELSE 'inactive' END;

-- 3) Normalize gender values (case-insensitive canonicalization).
UPDATE public.products
SET gender = CASE
  WHEN lower(COALESCE(gender, '')) IN ('male', 'boys', 'boy', 'm') THEN 'Male'
  WHEN lower(COALESCE(gender, '')) IN ('female', 'girls', 'girl', 'f') THEN 'Female'
  ELSE 'Unisex'
END
WHERE gender IS NULL
   OR gender NOT IN ('Male', 'Female', 'Unisex')
   OR gender <> CASE
      WHEN lower(COALESCE(gender, '')) IN ('male', 'boys', 'boy', 'm') THEN 'Male'
      WHEN lower(COALESCE(gender, '')) IN ('female', 'girls', 'girl', 'f') THEN 'Female'
      ELSE 'Unisex'
   END;

-- 4) Repair school/class mismatch using classes table as source of truth.
UPDATE public.products p
SET school_id = c.school_id
FROM public.classes c
WHERE p.class_id = c.id
  AND (p.school_id IS NULL OR p.school_id <> c.school_id);

-- 5) Backfill NULL school_id/class_id from product_assignments only when unambiguous.
WITH unique_scope AS (
  SELECT
    pa.product_id,
    min(pa.school_id) AS school_id,
    min(pa.class_id) AS class_id,
    count(DISTINCT pa.school_id) AS school_count,
    count(DISTINCT pa.class_id) AS class_count
  FROM public.product_assignments pa
  GROUP BY pa.product_id
  HAVING count(DISTINCT pa.school_id) = 1
     AND count(DISTINCT pa.class_id) = 1
)
UPDATE public.products p
SET
  school_id = COALESCE(p.school_id, us.school_id),
  class_id = COALESCE(p.class_id, us.class_id)
FROM unique_scope us
WHERE p.id = us.product_id
  AND (p.school_id IS NULL OR p.class_id IS NULL);

-- 6) Ensure every active product has at least one active variant.
INSERT INTO public.product_variants (product_id, size, stock, status, is_active)
SELECT p.id, 'default', 0, 'active', true
FROM public.products p
WHERE p.status = 'active'
  AND COALESCE(p.is_active, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.product_variants pv
    WHERE pv.product_id = p.id
      AND pv.status = 'active'
      AND COALESCE(pv.is_active, true) = true
  );

-- 7) Guard rail constraints for future data consistency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_gender_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_gender_check
      CHECK (gender IN ('Male', 'Female', 'Unisex'));
  END IF;
END
$$;
