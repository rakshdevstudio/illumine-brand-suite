-- Repair naming collision:
-- Procurement vendors become Suppliers. Marketplace vendors become Sellers.
-- This migration is intentionally additive and compatibility-preserving.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  gstin text,
  address text,
  state_code text,
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplier_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  designation text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  mode text,
  reference_no text,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.suppliers (
  id, name, phone, email, gstin, address, state_code, payment_terms_days, is_active, created_at, updated_at
)
SELECT
  v.id,
  v.name,
  v.phone,
  v.email,
  v.gstin,
  v.address,
  v.state_code,
  v.payment_terms_days,
  v.is_active,
  v.created_at,
  v.updated_at
FROM public.vendors v
WHERE NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = v.id)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT;

UPDATE public.purchases p
SET supplier_id = p.vendor_id
WHERE p.supplier_id IS NULL
  AND p.vendor_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p.vendor_id);

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'purchases'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'vendor_id'
      AND ccu.table_name = 'vendors'
  LOOP
    EXECUTE format('ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END
$$;

ALTER TABLE public.purchases
  ALTER COLUMN vendor_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS suppliers_name_unique_idx ON public.suppliers (lower(name));
CREATE INDEX IF NOT EXISTS suppliers_search_idx
  ON public.suppliers USING gin ((coalesce(name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(gstin, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS purchases_supplier_date_idx ON public.purchases (supplier_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS supplier_payments_supplier_date_idx ON public.supplier_payments (supplier_id, payment_date DESC);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers', 'supplier_contacts', 'supplier_payments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'backoffice_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'backoffice_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'backoffice_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'backoffice_delete_' || t, t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_backoffice_user())',
      'backoffice_select_' || t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_backoffice_user())',
      'backoffice_insert_' || t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_backoffice_user()) WITH CHECK (public.is_backoffice_user())',
      'backoffice_update_' || t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_backoffice_user())',
      'backoffice_delete_' || t,
      t
    );
  END LOOP;
END
$$;

-- Seller tables. If the earlier vendor marketplace migration ran, copy marketplace data across.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_account_status') THEN
    CREATE TYPE public.vendor_account_status AS ENUM ('pending_approval', 'active', 'suspended', 'rejected');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_product_approval_status') THEN
    CREATE TYPE public.vendor_product_approval_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'changes_requested');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_order_status') THEN
    CREATE TYPE public.vendor_order_status AS ENUM ('new', 'packed', 'ready_to_dispatch', 'shipped', 'delivered', 'returned', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_payout_status') THEN
    CREATE TYPE public.vendor_payout_status AS ENUM ('pending', 'processing', 'paid', 'on_hold', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_approval_type') THEN
    CREATE TYPE public.vendor_approval_type AS ENUM ('vendor_registration', 'product_listing', 'price_change', 'suspicious_activity');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_approval_status') THEN
    CREATE TYPE public.vendor_approval_status AS ENUM ('pending', 'approved', 'rejected', 'changes_requested');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  gstin text,
  address text,
  state_code text,
  status public.vendor_account_status NOT NULL DEFAULT 'pending_approval',
  commission_rate numeric(5,2) NOT NULL DEFAULT 15 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  is_active boolean NOT NULL DEFAULT false,
  onboarding_notes text,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  suspended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'operations', 'finance')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.seller_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  gender text NOT NULL DEFAULT 'Unisex',
  description text,
  base_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  image_url text,
  approval_status public.vendor_product_approval_status NOT NULL DEFAULT 'draft',
  listing_enabled boolean NOT NULL DEFAULT false,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_product_id uuid NOT NULL REFERENCES public.seller_products(id) ON DELETE CASCADE,
  product_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  size text NOT NULL,
  color text,
  sku text,
  barcode text,
  price numeric(12,2),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_product_id uuid NOT NULL REFERENCES public.seller_products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  fulfillment_status public.vendor_order_status NOT NULL DEFAULT 'new',
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  packed_at timestamptz,
  ready_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  returned_at timestamptz,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id)
);

CREATE TABLE IF NOT EXISTS public.seller_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  payout_number text NOT NULL UNIQUE,
  status public.vendor_payout_status NOT NULL DEFAULT 'pending',
  period_start date,
  period_end date,
  gross_sales numeric(12,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_payable numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_reference text,
  paid_at timestamptz,
  marked_paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE,
  seller_product_id uuid REFERENCES public.seller_products(id) ON DELETE CASCADE,
  approval_type public.vendor_approval_type NOT NULL,
  status public.vendor_approval_status NOT NULL DEFAULT 'pending',
  title text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seller_product_id uuid REFERENCES public.seller_products(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF to_regclass('public.vendor_users') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.sellers (id, name, phone, email, gstin, address, state_code, status, commission_rate, payment_terms_days, is_active, onboarding_notes, approved_at, approved_by, suspended_at, metadata, created_at, updated_at)
      SELECT DISTINCT v.id, v.name, v.phone, v.email, v.gstin, v.address, v.state_code, v.status, v.commission_rate, v.payment_terms_days, v.is_active, v.onboarding_notes, v.approved_at, v.approved_by, v.suspended_at, v.metadata, v.created_at, v.updated_at
      FROM public.vendors v
      WHERE EXISTS (SELECT 1 FROM public.vendor_users vu WHERE vu.vendor_id = v.id)
         OR EXISTS (SELECT 1 FROM public.vendor_products vp WHERE vp.vendor_id = v.id)
         OR EXISTS (SELECT 1 FROM public.vendor_approvals va WHERE va.vendor_id = v.id)
         OR (v.status = 'pending_approval' AND NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.supplier_id = v.id OR p.vendor_id = v.id))
      ON CONFLICT (id) DO NOTHING
    $copy$;

    EXECUTE $copy$
      INSERT INTO public.seller_users (id, seller_id, user_id, role, status, invited_by, invited_at, accepted_at, created_at, updated_at)
      SELECT id, vendor_id, user_id, role, status, invited_by, invited_at, accepted_at, created_at, updated_at
      FROM public.vendor_users
      ON CONFLICT (seller_id, user_id) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.vendor_products') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.seller_products (id, seller_id, product_id, name, category, school_id, class_id, gender, description, base_price, image_url, approval_status, listing_enabled, rejection_reason, submitted_at, reviewed_at, reviewed_by, created_by, created_at, updated_at)
      SELECT id, vendor_id, product_id, name, category, school_id, class_id, gender, description, base_price, image_url, approval_status, listing_enabled, rejection_reason, submitted_at, reviewed_at, reviewed_by, created_by, created_at, updated_at
      FROM public.vendor_products
      ON CONFLICT (id) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.vendor_product_variants') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.seller_product_variants (id, seller_product_id, product_variant_id, size, color, sku, barcode, price, stock, low_stock_threshold, status, created_at, updated_at)
      SELECT id, vendor_product_id, product_variant_id, size, color, sku, barcode, price, stock, low_stock_threshold, status, created_at, updated_at
      FROM public.vendor_product_variants
      ON CONFLICT (id) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.vendor_product_images') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.seller_product_images (id, seller_product_id, image_url, storage_path, is_primary, sort_order, created_at)
      SELECT id, vendor_product_id, image_url, storage_path, is_primary, sort_order, created_at
      FROM public.vendor_product_images
      ON CONFLICT (id) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.vendor_order_items') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.seller_order_items (id, seller_id, order_id, order_item_id, product_id, variant_id, fulfillment_status, gross_amount, commission_rate, commission_amount, net_amount, packed_at, ready_at, shipped_at, delivered_at, returned_at, updated_by, created_at, updated_at)
      SELECT id, vendor_id, order_id, order_item_id, product_id, variant_id, fulfillment_status, gross_amount, commission_rate, commission_amount, net_amount, packed_at, ready_at, shipped_at, delivered_at, returned_at, updated_by, created_at, updated_at
      FROM public.vendor_order_items
      ON CONFLICT (order_item_id) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.vendor_commissions') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.seller_commissions (id, seller_id, order_id, order_item_id, gross_amount, commission_rate, commission_amount, net_amount, created_at)
      SELECT id, vendor_id, order_id, order_item_id, gross_amount, commission_rate, commission_amount, net_amount, created_at
      FROM public.vendor_commissions
      ON CONFLICT (id) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.vendor_payouts') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.seller_payouts (id, seller_id, payout_number, status, period_start, period_end, gross_sales, commission_amount, net_payable, paid_amount, payment_reference, paid_at, marked_paid_by, notes, created_at, updated_at)
      SELECT id, vendor_id, payout_number, status, period_start, period_end, gross_sales, commission_amount, net_payable, paid_amount, payment_reference, paid_at, marked_paid_by, notes, created_at, updated_at
      FROM public.vendor_payouts
      ON CONFLICT (payout_number) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.vendor_approvals') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.seller_approvals (id, seller_id, seller_product_id, approval_type, status, title, details, requested_by, reviewed_by, reviewed_at, admin_note, created_at, updated_at)
      SELECT id, vendor_id, vendor_product_id, approval_type, status, title, details, requested_by, reviewed_by, reviewed_at, admin_note, created_at, updated_at
      FROM public.vendor_approvals
      ON CONFLICT (id) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.vendor_notifications') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.seller_notifications (id, seller_id, user_id, type, title, body, entity_type, entity_id, read_at, created_at)
      SELECT id, vendor_id, user_id, type, title, body, entity_type, entity_id, read_at, created_at
      FROM public.vendor_notifications
      ON CONFLICT (id) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.vendor_logs') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.seller_logs (id, seller_id, actor_id, action, entity_type, entity_id, old_values, new_values, reason, created_at)
      SELECT id, vendor_id, actor_id, action, entity_type, entity_id, old_values, new_values, reason, created_at
      FROM public.vendor_logs
      ON CONFLICT (id) DO NOTHING
    $copy$;
  END IF;
END
$$;

UPDATE public.products p
SET seller_id = p.vendor_id,
    seller_product_id = p.vendor_product_id
WHERE p.seller_id IS NULL
  AND p.vendor_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = p.vendor_id);

CREATE INDEX IF NOT EXISTS seller_users_user_idx ON public.seller_users(user_id);
CREATE INDEX IF NOT EXISTS seller_products_seller_status_idx ON public.seller_products(seller_id, approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_order_items_seller_status_idx ON public.seller_order_items(seller_id, fulfillment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_payouts_seller_status_idx ON public.seller_payouts(seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_approvals_status_idx ON public.seller_approvals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS products_seller_idx ON public.products(seller_id, approval_status);

CREATE OR REPLACE FUNCTION public.current_seller_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.seller_id
  FROM public.seller_users su
  JOIN public.sellers s ON s.id = su.seller_id
  WHERE su.user_id = auth.uid()
    AND su.status = 'active'
    AND s.status = 'active'
  ORDER BY su.created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_seller_id_any_status()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.seller_id
  FROM public.seller_users su
  WHERE su.user_id = auth.uid()
    AND su.status <> 'suspended'
  ORDER BY su.created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_seller(p_seller_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_illume_team_user()
    OR EXISTS (
      SELECT 1
      FROM public.seller_users su
      JOIN public.sellers s ON s.id = su.seller_id
      WHERE su.seller_id = p_seller_id
        AND su.user_id = auth.uid()
        AND su.status = 'active'
        AND s.status = 'active'
    )
$$;

ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sellers_self_or_admin_select ON public.sellers;
CREATE POLICY sellers_self_or_admin_select ON public.sellers
  FOR SELECT TO authenticated
  USING (
    public.is_illume_team_user()
    OR EXISTS (SELECT 1 FROM public.seller_users su WHERE su.seller_id = sellers.id AND su.user_id = auth.uid() AND su.status <> 'suspended')
  );

DROP POLICY IF EXISTS sellers_admin_all ON public.sellers;
CREATE POLICY sellers_admin_all ON public.sellers
  FOR ALL TO authenticated
  USING (public.is_illume_team_user())
  WITH CHECK (public.is_illume_team_user());

DROP POLICY IF EXISTS seller_users_scoped_select ON public.seller_users;
CREATE POLICY seller_users_scoped_select ON public.seller_users
  FOR SELECT TO authenticated
  USING (public.user_can_access_seller(seller_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS seller_products_scoped_select ON public.seller_products;
CREATE POLICY seller_products_scoped_select ON public.seller_products
  FOR SELECT TO authenticated
  USING (public.user_can_access_seller(seller_id));

DROP POLICY IF EXISTS seller_products_scoped_insert ON public.seller_products;
CREATE POLICY seller_products_scoped_insert ON public.seller_products
  FOR INSERT TO authenticated
  WITH CHECK (seller_id = public.current_seller_id() OR public.is_illume_team_user());

DROP POLICY IF EXISTS seller_products_scoped_update ON public.seller_products;
CREATE POLICY seller_products_scoped_update ON public.seller_products
  FOR UPDATE TO authenticated
  USING (public.user_can_access_seller(seller_id))
  WITH CHECK (public.user_can_access_seller(seller_id));

DROP POLICY IF EXISTS seller_product_variants_scoped_all ON public.seller_product_variants;
CREATE POLICY seller_product_variants_scoped_all ON public.seller_product_variants
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_products sp WHERE sp.id = seller_product_id AND public.user_can_access_seller(sp.seller_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_products sp WHERE sp.id = seller_product_id AND public.user_can_access_seller(sp.seller_id)));

DROP POLICY IF EXISTS seller_product_images_scoped_all ON public.seller_product_images;
CREATE POLICY seller_product_images_scoped_all ON public.seller_product_images
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_products sp WHERE sp.id = seller_product_id AND public.user_can_access_seller(sp.seller_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_products sp WHERE sp.id = seller_product_id AND public.user_can_access_seller(sp.seller_id)));

DROP POLICY IF EXISTS seller_order_items_scoped_select ON public.seller_order_items;
CREATE POLICY seller_order_items_scoped_select ON public.seller_order_items
  FOR SELECT TO authenticated
  USING (public.user_can_access_seller(seller_id));

DROP POLICY IF EXISTS seller_order_items_scoped_update ON public.seller_order_items;
CREATE POLICY seller_order_items_scoped_update ON public.seller_order_items
  FOR UPDATE TO authenticated
  USING (public.user_can_access_seller(seller_id))
  WITH CHECK (public.user_can_access_seller(seller_id));

DROP POLICY IF EXISTS seller_finance_scoped_select ON public.seller_commissions;
CREATE POLICY seller_finance_scoped_select ON public.seller_commissions
  FOR SELECT TO authenticated
  USING (public.user_can_access_seller(seller_id));

DROP POLICY IF EXISTS seller_payouts_scoped_select ON public.seller_payouts;
CREATE POLICY seller_payouts_scoped_select ON public.seller_payouts
  FOR SELECT TO authenticated
  USING (public.user_can_access_seller(seller_id));

DROP POLICY IF EXISTS seller_payouts_admin_all ON public.seller_payouts;
CREATE POLICY seller_payouts_admin_all ON public.seller_payouts
  FOR ALL TO authenticated
  USING (public.is_illume_team_user())
  WITH CHECK (public.is_illume_team_user());

DROP POLICY IF EXISTS seller_approvals_scoped_select ON public.seller_approvals;
CREATE POLICY seller_approvals_scoped_select ON public.seller_approvals
  FOR SELECT TO authenticated
  USING (public.is_illume_team_user() OR public.user_can_access_seller(seller_id));

DROP POLICY IF EXISTS seller_approvals_admin_all ON public.seller_approvals;
CREATE POLICY seller_approvals_admin_all ON public.seller_approvals
  FOR ALL TO authenticated
  USING (public.is_illume_team_user())
  WITH CHECK (public.is_illume_team_user());

DROP POLICY IF EXISTS seller_notifications_scoped_all ON public.seller_notifications;
CREATE POLICY seller_notifications_scoped_all ON public.seller_notifications
  FOR ALL TO authenticated
  USING (public.user_can_access_seller(seller_id) OR public.is_illume_team_user())
  WITH CHECK (public.user_can_access_seller(seller_id) OR public.is_illume_team_user());

DROP POLICY IF EXISTS seller_logs_scoped_select ON public.seller_logs;
CREATE POLICY seller_logs_scoped_select ON public.seller_logs
  FOR SELECT TO authenticated
  USING (public.user_can_access_seller(seller_id) OR public.is_illume_team_user());

CREATE OR REPLACE FUNCTION public.submit_seller_product(p_seller_product_id uuid)
RETURNS public.seller_products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sp public.seller_products;
BEGIN
  SELECT * INTO sp FROM public.seller_products WHERE id = p_seller_product_id FOR UPDATE;
  IF sp.id IS NULL THEN RAISE EXCEPTION 'Seller product not found'; END IF;
  IF NOT public.user_can_access_seller(sp.seller_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  UPDATE public.seller_products
  SET approval_status = 'submitted', submitted_at = now(), updated_at = now()
  WHERE id = p_seller_product_id
  RETURNING * INTO sp;

  INSERT INTO public.seller_approvals (seller_id, seller_product_id, approval_type, title, details, requested_by)
  VALUES (sp.seller_id, sp.id, 'product_listing', 'Product approval: ' || sp.name, jsonb_build_object('name', sp.name, 'category', sp.category, 'price', sp.base_price), auth.uid());

  INSERT INTO public.seller_logs (seller_id, actor_id, action, entity_type, entity_id, new_values)
  VALUES (sp.seller_id, auth.uid(), 'product_submitted', 'seller_product', sp.id, to_jsonb(sp));

  RETURN sp;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_seller_approval(
  p_approval_id uuid,
  p_status public.vendor_approval_status,
  p_admin_note text DEFAULT NULL
)
RETURNS public.seller_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approval public.seller_approvals;
  sp public.seller_products;
  approved_product_id uuid;
  approved_variant_id uuid;
  variant_row record;
BEGIN
  IF NOT public.is_illume_team_user() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_status NOT IN ('approved', 'rejected', 'changes_requested') THEN RAISE EXCEPTION 'Invalid review status'; END IF;

  UPDATE public.seller_approvals
  SET status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), admin_note = p_admin_note, updated_at = now()
  WHERE id = p_approval_id
  RETURNING * INTO approval;

  IF approval.id IS NULL THEN RAISE EXCEPTION 'Approval not found'; END IF;

  IF approval.approval_type = 'vendor_registration' AND approval.seller_id IS NOT NULL THEN
    UPDATE public.sellers
    SET status = CASE WHEN p_status = 'approved' THEN 'active'::public.vendor_account_status ELSE status END,
        is_active = CASE WHEN p_status = 'approved' THEN true ELSE is_active END,
        approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
        approved_by = CASE WHEN p_status = 'approved' THEN auth.uid() ELSE approved_by END,
        updated_at = now()
    WHERE id = approval.seller_id;
  END IF;

  IF approval.approval_type IN ('product_listing', 'price_change') AND approval.seller_product_id IS NOT NULL THEN
    SELECT * INTO sp FROM public.seller_products WHERE id = approval.seller_product_id FOR UPDATE;
    UPDATE public.seller_products
    SET approval_status = CASE
          WHEN p_status = 'approved' THEN 'approved'::public.vendor_product_approval_status
          WHEN p_status = 'rejected' THEN 'rejected'::public.vendor_product_approval_status
          ELSE 'changes_requested'::public.vendor_product_approval_status
        END,
        rejection_reason = p_admin_note,
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        listing_enabled = p_status = 'approved',
        updated_at = now()
    WHERE id = sp.id;

    IF p_status = 'approved' THEN
      IF sp.product_id IS NULL THEN
        INSERT INTO public.products (school_id, class_id, name, category, gender, price, image_url, description, status, seller_id, seller_product_id, approval_status, listing_enabled)
        VALUES (sp.school_id, sp.class_id, sp.name, sp.category, sp.gender, sp.base_price, sp.image_url, sp.description, 'active', sp.seller_id, sp.id, 'approved', true)
        RETURNING id INTO approved_product_id;

        UPDATE public.seller_products SET product_id = approved_product_id WHERE id = sp.id;
      ELSE
        approved_product_id := sp.product_id;
        UPDATE public.products
        SET name = sp.name, category = sp.category, gender = sp.gender, price = sp.base_price, image_url = sp.image_url, description = sp.description,
            status = 'active', seller_id = sp.seller_id, seller_product_id = sp.id, approval_status = 'approved', listing_enabled = true
        WHERE id = approved_product_id;
      END IF;

      FOR variant_row IN SELECT * FROM public.seller_product_variants WHERE seller_product_id = sp.id LOOP
        IF variant_row.product_variant_id IS NULL THEN
          INSERT INTO public.product_variants (product_id, size, sku, stock, price_override, status, low_stock_threshold, barcode)
          VALUES (approved_product_id, variant_row.size, variant_row.sku, variant_row.stock, variant_row.price, variant_row.status, variant_row.low_stock_threshold, variant_row.barcode)
          RETURNING id INTO approved_variant_id;

          UPDATE public.seller_product_variants SET product_variant_id = approved_variant_id WHERE id = variant_row.id;
        ELSE
          approved_variant_id := variant_row.product_variant_id;
          UPDATE public.product_variants
          SET size = variant_row.size, sku = variant_row.sku, price_override = variant_row.price, status = variant_row.status,
              low_stock_threshold = variant_row.low_stock_threshold, barcode = variant_row.barcode
          WHERE id = approved_variant_id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO public.seller_logs (seller_id, actor_id, action, entity_type, entity_id, new_values, reason)
  VALUES (approval.seller_id, auth.uid(), 'approval_reviewed', 'seller_approval', approval.id, to_jsonb(approval), p_admin_note);

  RETURN approval;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_seller_fulfillment(
  p_seller_order_item_id uuid,
  p_status public.vendor_order_status
)
RETURNS public.seller_order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.seller_order_items;
BEGIN
  SELECT * INTO item FROM public.seller_order_items WHERE id = p_seller_order_item_id FOR UPDATE;
  IF item.id IS NULL THEN RAISE EXCEPTION 'Seller order item not found'; END IF;
  IF NOT public.user_can_access_seller(item.seller_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  UPDATE public.seller_order_items
  SET fulfillment_status = p_status,
      packed_at = CASE WHEN p_status = 'packed' THEN now() ELSE packed_at END,
      ready_at = CASE WHEN p_status = 'ready_to_dispatch' THEN now() ELSE ready_at END,
      shipped_at = CASE WHEN p_status = 'shipped' THEN now() ELSE shipped_at END,
      delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END,
      returned_at = CASE WHEN p_status = 'returned' THEN now() ELSE returned_at END,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = p_seller_order_item_id
  RETURNING * INTO item;

  INSERT INTO public.seller_logs (seller_id, actor_id, action, entity_type, entity_id, new_values)
  VALUES (item.seller_id, auth.uid(), 'fulfillment_updated', 'seller_order_item', item.id, to_jsonb(item));

  RETURN item;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_seller_variant_stock(
  p_seller_variant_id uuid,
  p_new_stock integer,
  p_reason text,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sv public.seller_product_variants;
  sp public.seller_products;
  current_stock integer;
  delta integer;
  target_branch_id uuid;
  movement jsonb;
BEGIN
  IF p_new_stock IS NULL OR p_new_stock < 0 THEN RAISE EXCEPTION 'Stock must be zero or greater'; END IF;

  SELECT * INTO sv FROM public.seller_product_variants WHERE id = p_seller_variant_id FOR UPDATE;
  SELECT * INTO sp FROM public.seller_products WHERE id = sv.seller_product_id;
  IF sv.id IS NULL OR sp.id IS NULL THEN RAISE EXCEPTION 'Seller variant not found'; END IF;
  IF NOT public.user_can_access_seller(sp.seller_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  current_stock := sv.stock;
  delta := p_new_stock - current_stock;

  UPDATE public.seller_product_variants SET stock = p_new_stock, updated_at = now() WHERE id = sv.id;

  IF sv.product_variant_id IS NOT NULL AND delta <> 0 THEN
    target_branch_id := p_branch_id;
    IF target_branch_id IS NULL THEN
      SELECT id INTO target_branch_id FROM public.branches WHERE is_active = true ORDER BY created_at LIMIT 1;
    END IF;
    IF target_branch_id IS NOT NULL THEN
      movement := public.apply_inventory_movement(target_branch_id, sv.product_variant_id, 'ADJUSTMENT', delta, 'MANUAL', sv.product_variant_id, COALESCE(NULLIF(p_reason, ''), 'Seller stock update'), auth.uid());
    END IF;
  END IF;

  INSERT INTO public.seller_logs (seller_id, actor_id, action, entity_type, entity_id, old_values, new_values, reason)
  VALUES (sp.seller_id, auth.uid(), 'stock_updated', 'seller_product_variant', sv.id, jsonb_build_object('stock', current_stock), jsonb_build_object('stock', p_new_stock), p_reason);

  RETURN jsonb_build_object('old_stock', current_stock, 'new_stock', p_new_stock, 'delta', delta, 'movement', movement);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_seller_payout_paid(
  p_payout_id uuid,
  p_paid_amount numeric,
  p_payment_reference text DEFAULT NULL
)
RETURNS public.seller_payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payout public.seller_payouts;
BEGIN
  IF NOT public.is_illume_team_user() THEN RAISE EXCEPTION 'Admin access required'; END IF;

  UPDATE public.seller_payouts
  SET status = 'paid', paid_amount = p_paid_amount, payment_reference = p_payment_reference, paid_at = now(), marked_paid_by = auth.uid(), updated_at = now()
  WHERE id = p_payout_id
  RETURNING * INTO payout;

  IF payout.id IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;

  INSERT INTO public.seller_notifications (seller_id, type, title, body, entity_type, entity_id)
  VALUES (payout.seller_id, 'payout_released', 'Payout released', 'Settlement has been marked paid by Illume.', 'seller_payout', payout.id);

  RETURN payout;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_seller_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_seller_id uuid;
  rate numeric(5,2);
  gross numeric(12,2);
  commission numeric(12,2);
  net numeric(12,2);
BEGIN
  SELECT p.seller_id, COALESCE(s.commission_rate, 0)
    INTO product_seller_id, rate
  FROM public.products p
  LEFT JOIN public.sellers s ON s.id = p.seller_id
  WHERE p.id = NEW.product_id;

  IF product_seller_id IS NULL THEN RETURN NEW; END IF;

  gross := COALESCE(NEW.price, 0) * COALESCE(NEW.quantity, 0);
  commission := ROUND(gross * rate / 100, 2);
  net := gross - commission;

  INSERT INTO public.seller_order_items (seller_id, order_id, order_item_id, product_id, variant_id, fulfillment_status, gross_amount, commission_rate, commission_amount, net_amount)
  VALUES (product_seller_id, NEW.order_id, NEW.id, NEW.product_id, NEW.variant_id, 'new', gross, rate, commission, net)
  ON CONFLICT (order_item_id) DO NOTHING;

  INSERT INTO public.seller_commissions (seller_id, order_id, order_item_id, gross_amount, commission_rate, commission_amount, net_amount)
  VALUES (product_seller_id, NEW.order_id, NEW.id, gross, rate, commission, net);

  INSERT INTO public.seller_notifications (seller_id, type, title, body, entity_type, entity_id)
  VALUES (product_seller_id, 'new_order', 'New seller order', 'A new order contains one of your products.', 'order', NEW.order_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attach_vendor_order_item ON public.order_items;
DROP TRIGGER IF EXISTS trg_attach_seller_order_item ON public.order_items;
CREATE TRIGGER trg_attach_seller_order_item
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.attach_seller_order_item();

-- Procurement function now accepts supplier_id. vendor_id remains accepted as a legacy alias.
CREATE OR REPLACE FUNCTION public.create_purchase_with_ledger(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id uuid;
  v_purchase_no text;
  v_item jsonb;
  v_subtotal numeric(12,2) := 0;
  v_cgst numeric(12,2) := 0;
  v_sgst numeric(12,2) := 0;
  v_igst numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_line_base numeric(12,2);
  v_line_tax numeric(12,2);
  v_branch_id uuid;
  v_supplier_id uuid;
  v_seller_state text;
  v_supplier_state text;
  v_is_interstate boolean;
  v_ledger_id uuid;
  v_inventory_account text := COALESCE(NULLIF(p_payload->>'inventory_account_code', ''), '1000');
  v_payable_account text := COALESCE(NULLIF(p_payload->>'payable_account_code', ''), '2200');
  v_branch record;
  v_supplier record;
  v_ledger_lines jsonb;
BEGIN
  PERFORM public.assert_finance_admin();

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid purchase payload';
  END IF;

  v_supplier_id := COALESCE(NULLIF(p_payload->>'supplier_id', '')::uuid, NULLIF(p_payload->>'vendor_id', '')::uuid);
  v_branch_id := NULLIF(p_payload->>'branch_id', '')::uuid;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'supplier_id is required';
  END IF;

  IF COALESCE(jsonb_typeof(p_payload->'items'), '') <> 'array' OR jsonb_array_length(p_payload->'items') = 0 THEN
    RAISE EXCEPTION 'items are required';
  END IF;

  SELECT b.id, public.normalize_state_code(b.state_code) AS state_code
  INTO v_branch
  FROM public.branches b
  WHERE b.id = v_branch_id;

  SELECT s.id, public.normalize_state_code(s.state_code) AS state_code
  INTO v_supplier
  FROM public.suppliers s
  WHERE s.id = v_supplier_id;

  IF v_supplier.id IS NULL THEN
    RAISE EXCEPTION 'Supplier % not found', v_supplier_id;
  END IF;

  v_seller_state := COALESCE(v_branch.state_code, public.normalize_state_code(p_payload->>'seller_state_code'));
  v_supplier_state := COALESCE(v_supplier.state_code, public.normalize_state_code(p_payload->>'supplier_state_code'), public.normalize_state_code(p_payload->>'vendor_state_code'));

  IF v_seller_state IS NULL OR v_supplier_state IS NULL THEN
    RAISE EXCEPTION 'Cannot determine purchase GST regime. Missing seller/supplier state';
  END IF;

  v_is_interstate := (v_seller_state <> v_supplier_state);
  v_purchase_no := public.next_purchase_number(COALESCE(NULLIF(p_payload->>'purchase_date', '')::date, CURRENT_DATE));

  INSERT INTO public.purchases (
    purchase_number,
    supplier_id,
    vendor_id,
    branch_id,
    status,
    purchase_date,
    due_date,
    notes,
    created_by,
    seller_state_code,
    vendor_state_code,
    is_interstate
  )
  VALUES (
    v_purchase_no,
    v_supplier_id,
    v_supplier_id,
    v_branch_id,
    COALESCE(NULLIF(p_payload->>'status', '')::public.purchase_status, 'received'::public.purchase_status),
    COALESCE(NULLIF(p_payload->>'purchase_date', '')::date, CURRENT_DATE),
    NULLIF(p_payload->>'due_date', '')::date,
    NULLIF(p_payload->>'notes', ''),
    auth.uid(),
    v_seller_state,
    v_supplier_state,
    v_is_interstate
  )
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    IF COALESCE((v_item->>'quantity')::integer, 0) <= 0 THEN
      RAISE EXCEPTION 'Purchase item quantity must be > 0';
    END IF;

    IF COALESCE((v_item->>'unit_cost')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Purchase item unit cost must be >= 0';
    END IF;

    v_line_base := round((v_item->>'quantity')::integer * (v_item->>'unit_cost')::numeric, 2);
    v_line_tax := round(v_line_base * COALESCE((v_item->>'gst_percentage')::numeric, 5) / 100.0, 2);

    INSERT INTO public.purchase_items (
      purchase_id, product_id, variant_id, quantity, unit_cost, gst_percentage,
      cgst_amount, sgst_amount, igst_amount, line_total
    )
    VALUES (
      v_purchase_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'variant_id')::uuid,
      (v_item->>'quantity')::integer,
      round((v_item->>'unit_cost')::numeric, 2),
      round(COALESCE((v_item->>'gst_percentage')::numeric, 5), 2),
      CASE WHEN v_is_interstate THEN 0 ELSE round(v_line_tax / 2.0, 2) END,
      CASE WHEN v_is_interstate THEN 0 ELSE round(v_line_tax - (v_line_tax / 2.0), 2) END,
      CASE WHEN v_is_interstate THEN v_line_tax ELSE 0 END,
      round(v_line_base + v_line_tax, 2)
    );

    v_subtotal := v_subtotal + v_line_base;
    IF v_is_interstate THEN
      v_igst := v_igst + v_line_tax;
    ELSE
      v_cgst := v_cgst + round(v_line_tax / 2.0, 2);
      v_sgst := v_sgst + round(v_line_tax - (v_line_tax / 2.0), 2);
    END IF;

    IF v_branch_id IS NOT NULL THEN
      PERFORM public.apply_inventory_movement(
        v_branch_id,
        (v_item->>'variant_id')::uuid,
        'IN',
        (v_item->>'quantity')::integer,
        'SYSTEM',
        v_purchase_id,
        'Purchase receiving stock increase',
        auth.uid()
      );
    END IF;
  END LOOP;

  v_total := round(v_subtotal + v_cgst + v_sgst + v_igst, 2);

  UPDATE public.purchases
  SET subtotal = round(v_subtotal, 2),
      cgst = round(v_cgst, 2),
      sgst = round(v_sgst, 2),
      igst = round(v_igst, 2),
      total = v_total,
      status = 'received',
      updated_at = now()
  WHERE id = v_purchase_id;

  v_ledger_lines :=
    jsonb_build_array(jsonb_build_object('account_code', v_inventory_account, 'debit', v_subtotal, 'credit', 0))
    || CASE WHEN v_cgst > 0 THEN jsonb_build_array(jsonb_build_object('account_code', '1210', 'debit', v_cgst, 'credit', 0)) ELSE '[]'::jsonb END
    || CASE WHEN v_sgst > 0 THEN jsonb_build_array(jsonb_build_object('account_code', '1211', 'debit', v_sgst, 'credit', 0)) ELSE '[]'::jsonb END
    || CASE WHEN v_igst > 0 THEN jsonb_build_array(jsonb_build_object('account_code', '1212', 'debit', v_igst, 'credit', 0)) ELSE '[]'::jsonb END
    || jsonb_build_array(jsonb_build_object('account_code', v_payable_account, 'debit', 0, 'credit', v_total));

  v_ledger_id := public.create_balanced_ledger_entry(
    'purchase',
    v_purchase_id,
    CURRENT_DATE,
    v_branch_id,
    'Purchase from supplier ' || COALESCE(v_supplier.id::text, ''),
    v_ledger_lines
  );

  RETURN jsonb_build_object('purchase_id', v_purchase_id, 'purchase_number', v_purchase_no, 'ledger_entry_id', v_ledger_id);
END;
$$;

REVOKE ALL ON FUNCTION public.current_seller_id() FROM public;
REVOKE ALL ON FUNCTION public.current_seller_id_any_status() FROM public;
REVOKE ALL ON FUNCTION public.user_can_access_seller(uuid) FROM public;
REVOKE ALL ON FUNCTION public.submit_seller_product(uuid) FROM public;
REVOKE ALL ON FUNCTION public.review_seller_approval(uuid, public.vendor_approval_status, text) FROM public;
REVOKE ALL ON FUNCTION public.update_seller_fulfillment(uuid, public.vendor_order_status) FROM public;
REVOKE ALL ON FUNCTION public.update_seller_variant_stock(uuid, integer, text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.mark_seller_payout_paid(uuid, numeric, text) FROM public;
REVOKE ALL ON FUNCTION public.attach_seller_order_item() FROM public;
REVOKE ALL ON FUNCTION public.create_purchase_with_ledger(jsonb) FROM public;

GRANT EXECUTE ON FUNCTION public.current_seller_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_seller_id_any_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_seller(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_seller_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_seller_approval(uuid, public.vendor_approval_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_seller_fulfillment(uuid, public.vendor_order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_seller_variant_stock(uuid, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_seller_payout_paid(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_ledger(jsonb) TO authenticated;
