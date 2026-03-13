-- Universal Product Assignment System
-- Products remain universal and are mapped to storefront contexts via product_assignments

-- 1) Add base_price (backfilled from existing price)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS base_price numeric;

UPDATE public.products
SET base_price = COALESCE(base_price, price)
WHERE base_price IS NULL;

ALTER TABLE public.products
ALTER COLUMN base_price SET NOT NULL;

-- 2) Ensure all products are universal by default
ALTER TABLE public.products
ALTER COLUMN is_universal SET DEFAULT true;

UPDATE public.products
SET is_universal = true
WHERE is_universal IS DISTINCT FROM true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_always_universal'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_always_universal CHECK (is_universal = true);
  END IF;
END
$$;

-- Keep legacy fields nullable for backward compatibility.
ALTER TABLE public.products
ALTER COLUMN school_id DROP NOT NULL;

-- 3) Product assignment table (school/class/gender targeting)
CREATE TABLE IF NOT EXISTS public.product_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  gender text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT product_assignments_gender_check CHECK (gender IN ('Male', 'Female', 'Unisex')),
  CONSTRAINT product_assignments_unique_scope UNIQUE (product_id, school_id, class_id, gender)
);

CREATE INDEX IF NOT EXISTS idx_product_assignments_scope
  ON public.product_assignments (school_id, class_id, gender, display_order);

CREATE INDEX IF NOT EXISTS idx_product_assignments_product_id
  ON public.product_assignments (product_id);

ALTER TABLE public.product_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'product_assignments'
      AND policyname = 'Product assignments are viewable by everyone'
  ) THEN
    CREATE POLICY "Product assignments are viewable by everyone"
      ON public.product_assignments FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'product_assignments'
      AND policyname = 'Product assignments can be inserted by anyone'
  ) THEN
    CREATE POLICY "Product assignments can be inserted by anyone"
      ON public.product_assignments FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'product_assignments'
      AND policyname = 'Product assignments can be updated by anyone'
  ) THEN
    CREATE POLICY "Product assignments can be updated by anyone"
      ON public.product_assignments FOR UPDATE USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'product_assignments'
      AND policyname = 'Product assignments can be deleted by anyone'
  ) THEN
    CREATE POLICY "Product assignments can be deleted by anyone"
      ON public.product_assignments FOR DELETE USING (true);
  END IF;
END
$$;

-- 4) Backfill assignments from legacy product targeting fields
INSERT INTO public.product_assignments (
  product_id,
  school_id,
  class_id,
  gender,
  is_required,
  display_order
)
SELECT
  p.id,
  p.school_id,
  p.class_id,
  COALESCE(NULLIF(p.gender, ''), 'Unisex') AS gender,
  false AS is_required,
  ROW_NUMBER() OVER (
    PARTITION BY p.school_id, p.class_id, COALESCE(NULLIF(p.gender, ''), 'Unisex')
    ORDER BY p.name
  ) AS display_order
FROM public.products p
WHERE p.school_id IS NOT NULL
  AND p.class_id IS NOT NULL
  AND p.status = 'active'
ON CONFLICT (product_id, school_id, class_id, gender) DO NOTHING;
