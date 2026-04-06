-- Introduce variant-first pricing and school override layer without breaking existing data.

-- 1) Add base_price to product_variants if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_variants' AND column_name='base_price'
  ) THEN
    ALTER TABLE public.product_variants
      ADD COLUMN base_price numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END$$;

-- Backfill base_price from existing columns (price_override, products.price/base_price)
UPDATE public.product_variants pv
SET base_price = COALESCE(pv.price_override,
                          p.base_price,
                          p.price,
                          pv.base_price)
FROM public.products p
WHERE pv.product_id = p.id;

-- 2) Ensure unique size per product
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_product_size_key'
  ) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_product_size_key UNIQUE (product_id, size);
  END IF;
END$$;

-- 3) Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_product_variants_product_active ON public.product_variants (product_id, status);
CREATE INDEX IF NOT EXISTS idx_school_products_active ON public.school_products (school_id, is_active);

-- 4) School-level variant overrides table
CREATE TABLE IF NOT EXISTS public.school_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  override_price numeric(12,2) NOT NULL CHECK (override_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_spv_school ON public.school_product_variants (school_id);
CREATE INDEX IF NOT EXISTS idx_spv_variant ON public.school_product_variants (variant_id);

-- 5) Optional seed: link first school-product mapping to all variants of that product (no overrides yet)
INSERT INTO public.school_product_variants (school_id, variant_id, override_price)
SELECT sp.school_id, pv.id, pv.base_price
FROM public.school_products sp
JOIN public.product_variants pv ON pv.product_id = sp.product_id
LEFT JOIN public.school_product_variants spv ON spv.school_id = sp.school_id AND spv.variant_id = pv.id
WHERE spv.id IS NULL
LIMIT 50;

-- Note: Frontend should read price as COALESCE(spv.override_price, pv.base_price)
