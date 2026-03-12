-- ============================================================
-- Migration: Add is_universal to products
-- Date: 2026-03-12
-- ============================================================

-- 1. Make school_id nullable so universal products don't require a school
ALTER TABLE public.products
  ALTER COLUMN school_id DROP NOT NULL;

-- 2. Add is_universal flag (defaults to false — no existing product is affected)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_universal BOOLEAN NOT NULL DEFAULT false;

-- 3. Index for efficient storefront queries that filter on is_universal
CREATE INDEX IF NOT EXISTS idx_products_is_universal
  ON public.products (is_universal)
  WHERE is_universal = true;
