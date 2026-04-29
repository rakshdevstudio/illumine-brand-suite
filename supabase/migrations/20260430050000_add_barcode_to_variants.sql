-- ============================================================
-- Barcode System for product_variants
-- Created: 2026-04-30
-- ============================================================

-- 1. Add barcode fields to product_variants
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS barcode_value     TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS barcode_type      TEXT NOT NULL DEFAULT 'CODE128',
  ADD COLUMN IF NOT EXISTS barcode_generated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS label_print_count INTEGER NOT NULL DEFAULT 0;

-- 2. Create a unique barcode generator function
--    Format: ILL-XXXXXXXX (zero-padded numeric suffix from a sequence)
CREATE SEQUENCE IF NOT EXISTS public.barcode_seq START 1000 INCREMENT 1;

CREATE OR REPLACE FUNCTION public.generate_barcode_value()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq BIGINT;
  v_candidate TEXT;
BEGIN
  LOOP
    v_seq := nextval('public.barcode_seq');
    v_candidate := 'ILL-' || LPAD(v_seq::TEXT, 8, '0');
    -- Ensure uniqueness (should already be guaranteed by sequence, but safety check)
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.product_variants WHERE barcode_value = v_candidate
    );
  END LOOP;
  RETURN v_candidate;
END;
$$;

-- 3. Backfill all existing variants that have no barcode
UPDATE public.product_variants
SET
  barcode_value        = public.generate_barcode_value(),
  barcode_type         = 'CODE128',
  barcode_generated_at = now()
WHERE barcode_value IS NULL;

-- 4. Auto-generate barcode on INSERT of new variant (trigger)
CREATE OR REPLACE FUNCTION public.auto_assign_barcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.barcode_value IS NULL THEN
    NEW.barcode_value        := public.generate_barcode_value();
    NEW.barcode_type         := COALESCE(NEW.barcode_type, 'CODE128');
    NEW.barcode_generated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_barcode ON public.product_variants;
CREATE TRIGGER trg_auto_assign_barcode
  BEFORE INSERT ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_barcode();

-- 5. Index for fast POS barcode lookup
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode_value
  ON public.product_variants (barcode_value);

-- 6. RLS: allow admins to update barcode fields (inherits existing policies)
--    No new policies needed — existing "updated by anyone" policy covers it.
