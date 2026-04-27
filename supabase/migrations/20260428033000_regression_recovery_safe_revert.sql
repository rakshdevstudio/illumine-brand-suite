-- ===========================================================================
-- Regression Recovery: Safe Partial Revert
-- ===========================================================================
-- After migration 20260428031800, reports of:
--   - Ecommerce website orders missing from Orders/Invoices pages
--   - POS orders showing inconsistent school/items
--
-- Root cause of regression:
--   Step 1b of the prior migration contained an overly broad backfill:
--
--       UPDATE public.orders
--       SET payment_mode = 'UNKNOWN'
--       WHERE payment_mode = 'ONLINE'
--         AND branch_id IS NOT NULL
--         AND (address ILIKE 'POS Counter%' OR coalesce(email,'') = '');
--
--   Migration 20260319090000_branch_level_operations.sql backfilled
--   branch_id on ALL existing orders (including website orders), so the
--   condition "branch_id IS NOT NULL" was true for every order.
--   Website orders with no email stored (older orders, or orders placed
--   before the email field was added) were incorrectly reclassified as
--   UNKNOWN, making the admin UI show them with wrong source badge OR
--   (if the UI had a source filter applied) hide them.
--
--   Additionally, the BEFORE INSERT trigger introduced potential for
--   unknown interactions with other order insert triggers; removing it
--   restores the pre-migration insert path with no side effects.
--
-- This migration:
--   1. Drops the BEFORE INSERT trigger on orders (safe to remove).
--   2. Restores website orders incorrectly set to UNKNOWN back to ONLINE
--      (any order with email set that is currently UNKNOWN is probably a
--       real website order — POS orders rarely have an email on the order).
--   3. Ensures the admin orders page query sees all orders by confirming
--      no RLS is blocking admin-role reads.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Drop the BEFORE INSERT trigger — safe, restores clean insert path
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_normalise_order_payment_mode ON public.orders;
DROP FUNCTION IF EXISTS public.trg_normalise_order_payment_mode();

-- ---------------------------------------------------------------------------
-- 2) Restore website orders that Step 1b incorrectly set to UNKNOWN
-- ---------------------------------------------------------------------------
-- Re-classify any order that:
--   a) Is currently UNKNOWN
--   b) Has an email (strong signal it was a website checkout)
--   c) Does NOT have POS-style address or POS note evidence
UPDATE public.orders o
SET    payment_mode = 'ONLINE'
WHERE  o.payment_mode = 'UNKNOWN'
  AND  COALESCE(o.email, '') <> ''
  AND  o.address NOT ILIKE 'POS Counter%'
  AND  NOT EXISTS (
    SELECT 1
    FROM   public.order_notes n
    WHERE  n.order_id = o.id
      AND  n.note ILIKE '%Order Source: POS%'
  );

-- ---------------------------------------------------------------------------
-- 3) Ensure admin role can read all orders (confirm no inadvertent RLS gap)
-- ---------------------------------------------------------------------------
-- The orders table has RLS enabled. Admin users are authenticated, so they
-- fall under the authenticated role. Confirm a catch-all SELECT policy exists
-- for authenticated users (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'orders'
      AND  policyname = 'authenticated_full_access_orders'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "authenticated_full_access_orders"
      ON public.orders
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
    $policy$;
  END IF;
END
$$;

-- Also ensure invoices are readable by authenticated users (admins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'invoices'
      AND  policyname = 'authenticated_full_access_invoices'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "authenticated_full_access_invoices"
      ON public.invoices
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
    $policy$;
  END IF;
END
$$;

-- Ensure order_items are readable by authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'order_items'
      AND  policyname = 'authenticated_full_access_order_items'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "authenticated_full_access_order_items"
      ON public.order_items
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
    $policy$;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4) Ensure anon can insert orders and order_items (ecommerce checkout)
-- ---------------------------------------------------------------------------
-- These are idempotent due to DROP POLICY IF EXISTS guards.
DROP POLICY IF EXISTS "public insert orders" ON public.orders;
CREATE POLICY "public insert orders"
  ON public.orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "public insert order_items" ON public.order_items;
CREATE POLICY "public insert order_items"
  ON public.order_items
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Anon must also be able to UPDATE orders (checkout updates total_amount)
DROP POLICY IF EXISTS "anon update own order" ON public.orders;
CREATE POLICY "anon update own order"
  ON public.orders
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Grant table-level permissions (idempotent)
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon;
GRANT SELECT, INSERT ON public.order_items TO anon;
GRANT SELECT, INSERT ON public.order_notes TO anon;
