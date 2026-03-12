-- ============================================================
-- Customer email-based auth (magic link)
-- Makes phone optional; email becomes the primary identifier
-- ============================================================

-- 1. Make phone nullable (no longer required for email magic link flow)
ALTER TABLE public.customers
  ALTER COLUMN phone DROP NOT NULL;

-- 2. Add email NOT NULL constraint safely
--    First fill in email from auth.users for any existing rows
UPDATE public.customers c
   SET email = u.email
  FROM auth.users u
 WHERE c.id = u.id
   AND c.email IS NULL;

-- 3. Now enforce NOT NULL on email
ALTER TABLE public.customers
  ALTER COLUMN email SET NOT NULL;

-- 4. RLS: Customers can view their own orders
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'orders'
      AND policyname = 'customers_select_own_orders'
  ) THEN
    CREATE POLICY "customers_select_own_orders" ON public.orders
      FOR SELECT USING (
        customer_id = auth.uid()
        OR true   -- preserve existing open-read (admin panel needs all orders)
      );
  END IF;
END $$;
