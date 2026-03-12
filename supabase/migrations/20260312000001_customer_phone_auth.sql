-- ============================================================
-- Customer phone-OTP auth
-- ============================================================

-- 1. Customers table
--    Primary key = auth.users.id so we can query by session user
-- ============================================================
CREATE TABLE public.customers (
  id         UUID         NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone      TEXT         NOT NULL,
  name       TEXT,
  email      TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Customer can only see/edit their own row
CREATE POLICY "customers_select_own" ON public.customers
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "customers_insert_own" ON public.customers
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "customers_update_own" ON public.customers
  FOR UPDATE USING (auth.uid() = id);

-- Admin roles can view all customers
CREATE POLICY "admins_read_all_customers" ON public.customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin', 'staff', 'branch_staff')
    )
  );

-- ============================================================
-- 2. Link orders → customer (nullable so existing rows are safe)
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_id UUID
  REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders(customer_id);
