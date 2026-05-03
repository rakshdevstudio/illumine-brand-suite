-- Illume marketplace vendor module.
-- Additive by design: existing ecommerce/POS/admin flows keep their current tables,
-- while vendor-facing access goes through scoped ownership tables and RPCs.

DO $$
BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'illume_team';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

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

CREATE OR REPLACE FUNCTION public.is_illume_team_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text IN ('super_admin', 'admin', 'staff', 'branch_staff', 'illume_team')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_vendor_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'vendor'
  );
$$;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS status public.vendor_account_status NOT NULL DEFAULT 'pending_approval',
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) NOT NULL DEFAULT 15 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  ADD COLUMN IF NOT EXISTS onboarding_notes text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.vendors
SET status = CASE WHEN is_active THEN 'active'::public.vendor_account_status ELSE 'suspended'::public.vendor_account_status END
WHERE status = 'pending_approval';

CREATE TABLE IF NOT EXISTS public.vendor_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'operations', 'finance')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.vendor_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS public.vendor_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_product_id uuid NOT NULL REFERENCES public.vendor_products(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS public.vendor_product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_product_id uuid NOT NULL REFERENCES public.vendor_products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS public.vendor_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  payout_number text NOT NULL,
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payout_number)
);

CREATE TABLE IF NOT EXISTS public.vendor_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  vendor_product_id uuid REFERENCES public.vendor_products(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS public.vendor_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_product_id uuid REFERENCES public.vendor_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status public.vendor_product_approval_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS listing_enabled boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS vendor_users_user_idx ON public.vendor_users(user_id);
CREATE INDEX IF NOT EXISTS vendor_products_vendor_status_idx ON public.vendor_products(vendor_id, approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_product_variants_product_idx ON public.vendor_product_variants(vendor_product_id);
CREATE INDEX IF NOT EXISTS vendor_order_items_vendor_status_idx ON public.vendor_order_items(vendor_id, fulfillment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_order_items_order_idx ON public.vendor_order_items(order_id);
CREATE INDEX IF NOT EXISTS vendor_payouts_vendor_status_idx ON public.vendor_payouts(vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_approvals_status_idx ON public.vendor_approvals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_notifications_user_idx ON public.vendor_notifications(vendor_id, user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS products_vendor_idx ON public.products(vendor_id, approval_status);

CREATE OR REPLACE FUNCTION public.current_vendor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vu.vendor_id
  FROM public.vendor_users vu
  JOIN public.vendors v ON v.id = vu.vendor_id
  WHERE vu.user_id = auth.uid()
    AND vu.status = 'active'
    AND v.status = 'active'
  ORDER BY vu.created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_vendor_id_any_status()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vu.vendor_id
  FROM public.vendor_users vu
  WHERE vu.user_id = auth.uid()
    AND vu.status <> 'suspended'
  ORDER BY vu.created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_vendor(p_vendor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_illume_team_user()
    OR EXISTS (
      SELECT 1
      FROM public.vendor_users vu
      JOIN public.vendors v ON v.id = vu.vendor_id
      WHERE vu.vendor_id = p_vendor_id
        AND vu.user_id = auth.uid()
        AND vu.status = 'active'
        AND v.status = 'active'
    )
$$;

DROP POLICY IF EXISTS vendors_vendor_self_select ON public.vendors;
CREATE POLICY vendors_vendor_self_select ON public.vendors
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendor_users vu
      WHERE vu.vendor_id = vendors.id
        AND vu.user_id = auth.uid()
        AND vu.status <> 'suspended'
    )
  );

ALTER TABLE public.vendor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_users_scoped_select ON public.vendor_users;
CREATE POLICY vendor_users_scoped_select ON public.vendor_users
  FOR SELECT TO authenticated
  USING (
    public.user_can_access_vendor(vendor_id)
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS vendor_products_scoped_select ON public.vendor_products;
CREATE POLICY vendor_products_scoped_select ON public.vendor_products
  FOR SELECT TO authenticated
  USING (public.user_can_access_vendor(vendor_id));

DROP POLICY IF EXISTS vendor_products_scoped_insert ON public.vendor_products;
CREATE POLICY vendor_products_scoped_insert ON public.vendor_products
  FOR INSERT TO authenticated
  WITH CHECK (vendor_id = public.current_vendor_id() OR public.is_illume_team_user());

DROP POLICY IF EXISTS vendor_products_scoped_update ON public.vendor_products;
CREATE POLICY vendor_products_scoped_update ON public.vendor_products
  FOR UPDATE TO authenticated
  USING (public.user_can_access_vendor(vendor_id))
  WITH CHECK (public.user_can_access_vendor(vendor_id));

DROP POLICY IF EXISTS vendor_product_variants_scoped_all ON public.vendor_product_variants;
CREATE POLICY vendor_product_variants_scoped_all ON public.vendor_product_variants
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_products vp
      WHERE vp.id = vendor_product_id
        AND public.user_can_access_vendor(vp.vendor_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendor_products vp
      WHERE vp.id = vendor_product_id
        AND public.user_can_access_vendor(vp.vendor_id)
    )
  );

DROP POLICY IF EXISTS vendor_product_images_scoped_all ON public.vendor_product_images;
CREATE POLICY vendor_product_images_scoped_all ON public.vendor_product_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_products vp
      WHERE vp.id = vendor_product_id
        AND public.user_can_access_vendor(vp.vendor_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendor_products vp
      WHERE vp.id = vendor_product_id
        AND public.user_can_access_vendor(vp.vendor_id)
    )
  );

DROP POLICY IF EXISTS vendor_order_items_scoped_select ON public.vendor_order_items;
CREATE POLICY vendor_order_items_scoped_select ON public.vendor_order_items
  FOR SELECT TO authenticated
  USING (public.user_can_access_vendor(vendor_id));

DROP POLICY IF EXISTS vendor_order_items_scoped_update ON public.vendor_order_items;
CREATE POLICY vendor_order_items_scoped_update ON public.vendor_order_items
  FOR UPDATE TO authenticated
  USING (public.user_can_access_vendor(vendor_id))
  WITH CHECK (public.user_can_access_vendor(vendor_id));

DROP POLICY IF EXISTS vendor_finance_scoped_select ON public.vendor_commissions;
CREATE POLICY vendor_finance_scoped_select ON public.vendor_commissions
  FOR SELECT TO authenticated
  USING (public.user_can_access_vendor(vendor_id));

DROP POLICY IF EXISTS vendor_payouts_scoped_select ON public.vendor_payouts;
CREATE POLICY vendor_payouts_scoped_select ON public.vendor_payouts
  FOR SELECT TO authenticated
  USING (public.user_can_access_vendor(vendor_id));

DROP POLICY IF EXISTS vendor_payouts_admin_all ON public.vendor_payouts;
CREATE POLICY vendor_payouts_admin_all ON public.vendor_payouts
  FOR ALL TO authenticated
  USING (public.is_illume_team_user())
  WITH CHECK (public.is_illume_team_user());

DROP POLICY IF EXISTS vendor_approvals_scoped_select ON public.vendor_approvals;
CREATE POLICY vendor_approvals_scoped_select ON public.vendor_approvals
  FOR SELECT TO authenticated
  USING (public.is_illume_team_user() OR public.user_can_access_vendor(vendor_id));

DROP POLICY IF EXISTS vendor_approvals_admin_update ON public.vendor_approvals;
CREATE POLICY vendor_approvals_admin_update ON public.vendor_approvals
  FOR UPDATE TO authenticated
  USING (public.is_illume_team_user())
  WITH CHECK (public.is_illume_team_user());

DROP POLICY IF EXISTS vendor_approvals_admin_insert ON public.vendor_approvals;
CREATE POLICY vendor_approvals_admin_insert ON public.vendor_approvals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_illume_team_user());

DROP POLICY IF EXISTS vendor_notifications_scoped_all ON public.vendor_notifications;
CREATE POLICY vendor_notifications_scoped_all ON public.vendor_notifications
  FOR ALL TO authenticated
  USING (public.user_can_access_vendor(vendor_id) OR public.is_illume_team_user())
  WITH CHECK (public.user_can_access_vendor(vendor_id) OR public.is_illume_team_user());

DROP POLICY IF EXISTS vendor_logs_scoped_select ON public.vendor_logs;
CREATE POLICY vendor_logs_scoped_select ON public.vendor_logs
  FOR SELECT TO authenticated
  USING (public.user_can_access_vendor(vendor_id) OR public.is_illume_team_user());

CREATE OR REPLACE FUNCTION public.submit_vendor_product(p_vendor_product_id uuid)
RETURNS public.vendor_products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vp public.vendor_products;
BEGIN
  SELECT * INTO vp
  FROM public.vendor_products
  WHERE id = p_vendor_product_id
  FOR UPDATE;

  IF vp.id IS NULL THEN
    RAISE EXCEPTION 'Vendor product not found';
  END IF;

  IF NOT public.user_can_access_vendor(vp.vendor_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vendor_products
  SET approval_status = 'submitted',
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_vendor_product_id
  RETURNING * INTO vp;

  INSERT INTO public.vendor_approvals (vendor_id, vendor_product_id, approval_type, title, details, requested_by)
  VALUES (
    vp.vendor_id,
    vp.id,
    'product_listing',
    'Product approval: ' || vp.name,
    jsonb_build_object('name', vp.name, 'category', vp.category, 'price', vp.base_price),
    auth.uid()
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.vendor_logs (vendor_id, actor_id, action, entity_type, entity_id, new_values)
  VALUES (vp.vendor_id, auth.uid(), 'product_submitted', 'vendor_product', vp.id, to_jsonb(vp));

  RETURN vp;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_vendor_approval(
  p_approval_id uuid,
  p_status public.vendor_approval_status,
  p_admin_note text DEFAULT NULL
)
RETURNS public.vendor_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approval public.vendor_approvals;
  vp public.vendor_products;
  approved_product_id uuid;
  variant_row record;
  approved_variant_id uuid;
BEGIN
  IF NOT public.is_illume_team_user() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_status NOT IN ('approved', 'rejected', 'changes_requested') THEN
    RAISE EXCEPTION 'Invalid review status';
  END IF;

  UPDATE public.vendor_approvals
  SET status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_note = p_admin_note,
      updated_at = now()
  WHERE id = p_approval_id
  RETURNING * INTO approval;

  IF approval.id IS NULL THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;

  IF approval.approval_type = 'vendor_registration' AND approval.vendor_id IS NOT NULL THEN
    UPDATE public.vendors
    SET status = CASE WHEN p_status = 'approved' THEN 'active'::public.vendor_account_status ELSE status END,
        is_active = CASE WHEN p_status = 'approved' THEN true ELSE is_active END,
        approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
        approved_by = CASE WHEN p_status = 'approved' THEN auth.uid() ELSE approved_by END,
        updated_at = now()
    WHERE id = approval.vendor_id;
  END IF;

  IF approval.approval_type IN ('product_listing', 'price_change') AND approval.vendor_product_id IS NOT NULL THEN
    SELECT * INTO vp
    FROM public.vendor_products
    WHERE id = approval.vendor_product_id
    FOR UPDATE;

    UPDATE public.vendor_products
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
    WHERE id = vp.id;

    IF p_status = 'approved' THEN
      IF vp.product_id IS NULL THEN
        INSERT INTO public.products (
          school_id, class_id, name, category, gender, price, image_url, description, status,
          vendor_id, vendor_product_id, approval_status, listing_enabled
        )
        VALUES (
          vp.school_id, vp.class_id, vp.name, vp.category, vp.gender, vp.base_price, vp.image_url, vp.description,
          'active', vp.vendor_id, vp.id, 'approved', true
        )
        RETURNING id INTO approved_product_id;

        UPDATE public.vendor_products
        SET product_id = approved_product_id
        WHERE id = vp.id;
      ELSE
        approved_product_id := vp.product_id;
        UPDATE public.products
        SET name = vp.name,
            category = vp.category,
            gender = vp.gender,
            price = vp.base_price,
            image_url = vp.image_url,
            description = vp.description,
            status = 'active',
            approval_status = 'approved',
            listing_enabled = true
        WHERE id = approved_product_id;
      END IF;

      FOR variant_row IN
        SELECT * FROM public.vendor_product_variants WHERE vendor_product_id = vp.id
      LOOP
        IF variant_row.product_variant_id IS NULL THEN
          INSERT INTO public.product_variants (
            product_id, size, sku, stock, price_override, status, low_stock_threshold, barcode
          )
          VALUES (
            approved_product_id, variant_row.size, variant_row.sku, variant_row.stock, variant_row.price,
            variant_row.status, variant_row.low_stock_threshold, variant_row.barcode
          )
          RETURNING id INTO approved_variant_id;

          UPDATE public.vendor_product_variants
          SET product_variant_id = approved_variant_id
          WHERE id = variant_row.id;
        ELSE
          approved_variant_id := variant_row.product_variant_id;
          UPDATE public.product_variants
          SET size = variant_row.size,
              sku = variant_row.sku,
              price_override = variant_row.price,
              status = variant_row.status,
              low_stock_threshold = variant_row.low_stock_threshold,
              barcode = variant_row.barcode
          WHERE id = approved_variant_id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO public.vendor_logs (vendor_id, actor_id, action, entity_type, entity_id, new_values, reason)
  VALUES (approval.vendor_id, auth.uid(), 'approval_reviewed', 'vendor_approval', approval.id, to_jsonb(approval), p_admin_note);

  RETURN approval;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_vendor_fulfillment(
  p_vendor_order_item_id uuid,
  p_status public.vendor_order_status
)
RETURNS public.vendor_order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.vendor_order_items;
BEGIN
  SELECT * INTO item
  FROM public.vendor_order_items
  WHERE id = p_vendor_order_item_id
  FOR UPDATE;

  IF item.id IS NULL THEN
    RAISE EXCEPTION 'Vendor order item not found';
  END IF;

  IF NOT public.user_can_access_vendor(item.vendor_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vendor_order_items
  SET fulfillment_status = p_status,
      packed_at = CASE WHEN p_status = 'packed' THEN now() ELSE packed_at END,
      ready_at = CASE WHEN p_status = 'ready_to_dispatch' THEN now() ELSE ready_at END,
      shipped_at = CASE WHEN p_status = 'shipped' THEN now() ELSE shipped_at END,
      delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END,
      returned_at = CASE WHEN p_status = 'returned' THEN now() ELSE returned_at END,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = p_vendor_order_item_id
  RETURNING * INTO item;

  INSERT INTO public.vendor_logs (vendor_id, actor_id, action, entity_type, entity_id, new_values)
  VALUES (item.vendor_id, auth.uid(), 'fulfillment_updated', 'vendor_order_item', item.id, to_jsonb(item));

  RETURN item;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_vendor_variant_stock(
  p_vendor_variant_id uuid,
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
  vv public.vendor_product_variants;
  vp public.vendor_products;
  current_stock integer;
  delta integer;
  target_branch_id uuid;
  movement jsonb;
BEGIN
  IF p_new_stock IS NULL OR p_new_stock < 0 THEN
    RAISE EXCEPTION 'Stock must be zero or greater';
  END IF;

  SELECT * INTO vv
  FROM public.vendor_product_variants
  WHERE id = p_vendor_variant_id
  FOR UPDATE;

  SELECT * INTO vp
  FROM public.vendor_products
  WHERE id = vv.vendor_product_id;

  IF vv.id IS NULL OR vp.id IS NULL THEN
    RAISE EXCEPTION 'Vendor variant not found';
  END IF;

  IF NOT public.user_can_access_vendor(vp.vendor_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  current_stock := vv.stock;
  delta := p_new_stock - current_stock;

  UPDATE public.vendor_product_variants
  SET stock = p_new_stock,
      updated_at = now()
  WHERE id = vv.id;

  IF vv.product_variant_id IS NOT NULL AND delta <> 0 THEN
    target_branch_id := p_branch_id;
    IF target_branch_id IS NULL THEN
      SELECT id INTO target_branch_id
      FROM public.branches
      WHERE is_active = true
      ORDER BY created_at
      LIMIT 1;
    END IF;

    IF target_branch_id IS NOT NULL THEN
      movement := public.apply_inventory_movement(
        target_branch_id,
        vv.product_variant_id,
        'ADJUSTMENT',
        delta,
        'MANUAL',
        vv.product_variant_id,
        COALESCE(NULLIF(p_reason, ''), 'Vendor stock update'),
        auth.uid()
      );
    END IF;
  END IF;

  INSERT INTO public.vendor_logs (vendor_id, actor_id, action, entity_type, entity_id, old_values, new_values, reason)
  VALUES (
    vp.vendor_id,
    auth.uid(),
    'stock_updated',
    'vendor_product_variant',
    vv.id,
    jsonb_build_object('stock', current_stock),
    jsonb_build_object('stock', p_new_stock),
    p_reason
  );

  RETURN jsonb_build_object('old_stock', current_stock, 'new_stock', p_new_stock, 'delta', delta, 'movement', movement);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_vendor_payout_paid(
  p_payout_id uuid,
  p_paid_amount numeric,
  p_payment_reference text DEFAULT NULL
)
RETURNS public.vendor_payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payout public.vendor_payouts;
BEGIN
  IF NOT public.is_illume_team_user() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.vendor_payouts
  SET status = 'paid',
      paid_amount = p_paid_amount,
      payment_reference = p_payment_reference,
      paid_at = now(),
      marked_paid_by = auth.uid(),
      updated_at = now()
  WHERE id = p_payout_id
  RETURNING * INTO payout;

  IF payout.id IS NULL THEN
    RAISE EXCEPTION 'Payout not found';
  END IF;

  INSERT INTO public.vendor_notifications (vendor_id, type, title, body, entity_type, entity_id)
  VALUES (payout.vendor_id, 'payout_released', 'Payout released', 'Settlement has been marked paid by Illume.', 'vendor_payout', payout.id);

  RETURN payout;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_vendor_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_vendor_id uuid;
  rate numeric(5,2);
  gross numeric(12,2);
  commission numeric(12,2);
  net numeric(12,2);
BEGIN
  SELECT p.vendor_id, COALESCE(v.commission_rate, 0)
    INTO product_vendor_id, rate
  FROM public.products p
  LEFT JOIN public.vendors v ON v.id = p.vendor_id
  WHERE p.id = NEW.product_id;

  IF product_vendor_id IS NULL THEN
    RETURN NEW;
  END IF;

  gross := COALESCE(NEW.price, 0) * COALESCE(NEW.quantity, 0);
  commission := ROUND(gross * rate / 100, 2);
  net := gross - commission;

  INSERT INTO public.vendor_order_items (
    vendor_id,
    order_id,
    order_item_id,
    product_id,
    variant_id,
    fulfillment_status,
    gross_amount,
    commission_rate,
    commission_amount,
    net_amount
  )
  VALUES (
    product_vendor_id,
    NEW.order_id,
    NEW.id,
    NEW.product_id,
    NEW.variant_id,
    'new',
    gross,
    rate,
    commission,
    net
  )
  ON CONFLICT (order_item_id) DO NOTHING;

  INSERT INTO public.vendor_commissions (
    vendor_id,
    order_id,
    order_item_id,
    gross_amount,
    commission_rate,
    commission_amount,
    net_amount
  )
  VALUES (
    product_vendor_id,
    NEW.order_id,
    NEW.id,
    gross,
    rate,
    commission,
    net
  );

  INSERT INTO public.vendor_notifications (vendor_id, type, title, body, entity_type, entity_id)
  VALUES (product_vendor_id, 'new_order', 'New vendor order', 'A new order contains one of your products.', 'order', NEW.order_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attach_vendor_order_item ON public.order_items;
CREATE TRIGGER trg_attach_vendor_order_item
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.attach_vendor_order_item();

REVOKE ALL ON FUNCTION public.current_vendor_id() FROM public;
REVOKE ALL ON FUNCTION public.current_vendor_id_any_status() FROM public;
REVOKE ALL ON FUNCTION public.user_can_access_vendor(uuid) FROM public;
REVOKE ALL ON FUNCTION public.submit_vendor_product(uuid) FROM public;
REVOKE ALL ON FUNCTION public.review_vendor_approval(uuid, public.vendor_approval_status, text) FROM public;
REVOKE ALL ON FUNCTION public.update_vendor_fulfillment(uuid, public.vendor_order_status) FROM public;
REVOKE ALL ON FUNCTION public.update_vendor_variant_stock(uuid, integer, text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.mark_vendor_payout_paid(uuid, numeric, text) FROM public;
REVOKE ALL ON FUNCTION public.attach_vendor_order_item() FROM public;

GRANT EXECUTE ON FUNCTION public.current_vendor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_vendor_id_any_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_vendor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_vendor_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_vendor_approval(uuid, public.vendor_approval_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_vendor_fulfillment(uuid, public.vendor_order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_vendor_variant_stock(uuid, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_vendor_payout_paid(uuid, numeric, text) TO authenticated;
