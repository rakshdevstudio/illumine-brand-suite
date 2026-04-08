-- Production hardening for storefront visibility, inventory ownership, and admin-managed catalog data.

-- 1) Explicit archived flag for products so storefront visibility is not inferred indirectly.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

UPDATE public.products
SET archived = CASE
  WHEN deleted_at IS NOT NULL THEN true
  WHEN COALESCE(is_active, true) = false THEN true
  WHEN lower(COALESCE(status, 'active')) <> 'active' THEN true
  ELSE false
END
WHERE archived IS DISTINCT FROM CASE
  WHEN deleted_at IS NOT NULL THEN true
  WHEN COALESCE(is_active, true) = false THEN true
  WHEN lower(COALESCE(status, 'active')) <> 'active' THEN true
  ELSE false
END;

-- 2) Optional product-level size chart metadata.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS size_chart_title text,
  ADD COLUMN IF NOT EXISTS size_chart_notes text,
  ADD COLUMN IF NOT EXISTS size_chart_rows jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.products
SET size_chart_rows = '[]'::jsonb
WHERE size_chart_rows IS NULL OR jsonb_typeof(size_chart_rows) <> 'array';

-- 3) Storefront delivery messaging, with school override support and a global fallback row.
CREATE TABLE IF NOT EXISTS public.storefront_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  shipping_mode text NOT NULL DEFAULT 'included',
  shipping_fee numeric(12,2) NOT NULL DEFAULT 0,
  free_shipping_threshold numeric(12,2) NULL,
  eta_min_business_days integer NULL,
  eta_max_business_days integer NULL,
  shipping_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storefront_settings_school_unique UNIQUE (school_id),
  CONSTRAINT storefront_settings_shipping_mode_check CHECK (shipping_mode IN ('included', 'flat', 'conditional', 'contact')),
  CONSTRAINT storefront_settings_fee_check CHECK (shipping_fee >= 0),
  CONSTRAINT storefront_settings_eta_check CHECK (
    eta_min_business_days IS NULL OR eta_max_business_days IS NULL OR eta_min_business_days <= eta_max_business_days
  )
);

ALTER TABLE public.storefront_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Storefront settings are viewable by everyone" ON public.storefront_settings;
CREATE POLICY "Storefront settings are viewable by everyone"
ON public.storefront_settings
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Storefront settings manageable by admins" ON public.storefront_settings;
CREATE POLICY "Storefront settings manageable by admins"
ON public.storefront_settings
FOR ALL
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE INDEX IF NOT EXISTS storefront_settings_school_id_idx
  ON public.storefront_settings (school_id);

INSERT INTO public.storefront_settings (
  school_id,
  shipping_mode,
  shipping_fee,
  eta_min_business_days,
  eta_max_business_days,
  shipping_note
)
SELECT
  NULL,
  'included',
  0,
  NULL,
  NULL,
  'Delivery timing is confirmed after order review. Shipping is never promised in the storefront unless it is configured here.'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.storefront_settings
  WHERE school_id IS NULL
);

-- 4) Inventory is the only stock source. Keep legacy product_variants.stock inert for compatibility.
UPDATE public.product_variants
SET stock = 0
WHERE COALESCE(stock, 0) <> 0;

CREATE OR REPLACE FUNCTION public.lock_variant_stock_shadow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.stock := 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_variant_stock_shadow ON public.product_variants;
CREATE TRIGGER trg_lock_variant_stock_shadow
BEFORE INSERT OR UPDATE OF stock
ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.lock_variant_stock_shadow();

CREATE OR REPLACE FUNCTION public.sync_branch_inventory_for_new_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.branch_inventory (branch_id, product_id, variant_id, stock, updated_at)
  SELECT
    b.id,
    NEW.product_id,
    NEW.id,
    0,
    now()
  FROM public.branches b
  WHERE COALESCE(b.is_active, true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.branch_inventory bi
      WHERE bi.branch_id = b.id
        AND bi.variant_id = NEW.id
    );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_branch_inventory_for_new_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_active, true) THEN
    INSERT INTO public.branch_inventory (branch_id, product_id, variant_id, stock, updated_at)
    SELECT
      NEW.id,
      pv.product_id,
      pv.id,
      0,
      now()
    FROM public.product_variants pv
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.branch_inventory bi
      WHERE bi.branch_id = NEW.id
        AND bi.variant_id = pv.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_branch_inventory()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  active_branch_count integer := 0;
  variant_count integer := 0;
  inserted_count integer := 0;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_role(current_user_id, 'admin')
    OR public.has_role(current_user_id, 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Only admins can initialize branch inventory';
  END IF;

  INSERT INTO public.branches (name, location, is_active)
  SELECT 'Main Branch', 'Head Office', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.branches
    WHERE COALESCE(is_active, true)
  );

  SELECT count(*) INTO active_branch_count
  FROM public.branches
  WHERE COALESCE(is_active, true);

  SELECT count(*) INTO variant_count
  FROM public.product_variants;

  WITH inserted AS (
    INSERT INTO public.branch_inventory (branch_id, product_id, variant_id, stock, updated_at)
    SELECT
      b.id,
      pv.product_id,
      pv.id,
      0,
      now()
    FROM public.branches b
    CROSS JOIN public.product_variants pv
    WHERE COALESCE(b.is_active, true)
      AND NOT EXISTS (
        SELECT 1
        FROM public.branch_inventory bi
        WHERE bi.branch_id = b.id
          AND bi.variant_id = pv.id
      )
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM inserted;

  RETURN jsonb_build_object(
    'status', 'ok',
    'activeBranches', active_branch_count,
    'variants', variant_count,
    'rowsInserted', inserted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_branch_inventory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initialize_branch_inventory() TO authenticated;

-- 5) Tighten profile inserts to self or admin initiated work only.
DROP POLICY IF EXISTS "Profiles insertable" ON public.profiles;
CREATE POLICY "Profiles insertable by admins or self"
ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

-- 6) Product lifecycle should keep archived/status fields in sync and delete branch inventory on hard delete.
CREATE OR REPLACE FUNCTION public.archive_product_cascade(
  p_product_id uuid,
  p_deleted_at timestamptz,
  p_deleted_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor uuid := COALESCE(p_deleted_by, auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Activity log actor is required';
  END IF;

  PERFORM public.ensure_profile_for_user(v_actor);

  UPDATE public.products
    SET is_active = false,
        archived = true,
        status = 'inactive',
        deleted_at = p_deleted_at,
        deleted_by = v_actor
  WHERE id = p_product_id;

  UPDATE public.product_variants
    SET is_active = false,
        status = 'inactive',
        deleted_at = p_deleted_at,
        deleted_by = v_actor
  WHERE product_id = p_product_id;

  UPDATE public.school_products
    SET is_active = false,
        deleted_at = p_deleted_at,
        deleted_by = v_actor
  WHERE product_id = p_product_id;

  UPDATE public.school_product_variants spv
    SET is_active = false,
        deleted_at = p_deleted_at,
        deleted_by = v_actor
  WHERE spv.variant_id IN (
    SELECT id FROM public.product_variants WHERE product_id = p_product_id
  );

  PERFORM public.log_product_activity('ARCHIVE', p_product_id, 'product', 'Product archived', v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_product_cascade(
  p_product_id uuid,
  p_actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor, auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Activity log actor is required';
  END IF;

  PERFORM public.ensure_profile_for_user(v_actor);

  UPDATE public.products
    SET is_active = true,
        archived = false,
        status = 'active',
        deleted_at = NULL,
        deleted_by = NULL
  WHERE id = p_product_id;

  UPDATE public.product_variants
    SET is_active = true,
        status = 'active',
        deleted_at = NULL,
        deleted_by = NULL
  WHERE product_id = p_product_id;

  UPDATE public.school_products
    SET is_active = true,
        deleted_at = NULL,
        deleted_by = NULL
  WHERE product_id = p_product_id;

  UPDATE public.school_product_variants spv
    SET is_active = true,
        deleted_at = NULL,
        deleted_by = NULL
  WHERE spv.variant_id IN (
    SELECT id FROM public.product_variants WHERE product_id = p_product_id
  );

  PERFORM public.log_product_activity('RESTORE', p_product_id, 'product', 'Product restored', v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.hard_delete_product_cascade(
  p_product_id uuid,
  p_actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor, auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Activity log actor is required';
  END IF;

  PERFORM public.ensure_profile_for_user(v_actor);

  DELETE FROM public.school_product_variants
    WHERE variant_id IN (SELECT id FROM public.product_variants WHERE product_id = p_product_id);

  DELETE FROM public.branch_inventory
    WHERE variant_id IN (SELECT id FROM public.product_variants WHERE product_id = p_product_id);

  DELETE FROM public.inventory_logs
    WHERE variant_id IN (SELECT id FROM public.product_variants WHERE product_id = p_product_id);

  DELETE FROM public.inventory_movements
    WHERE variant_id IN (SELECT id FROM public.product_variants WHERE product_id = p_product_id);

  DELETE FROM public.product_variants
    WHERE product_id = p_product_id;

  DELETE FROM public.school_products
    WHERE product_id = p_product_id;

  DELETE FROM public.products
    WHERE id = p_product_id;

  PERFORM public.log_product_activity('HARD_DELETE', p_product_id, 'product', 'Product permanently deleted', v_actor);
END;
$$;

-- 7) Shared storefront RPCs that respect archived products, active variants, and inventory-owned stock totals.
CREATE OR REPLACE FUNCTION public.get_store_class_products(
  p_school_id uuid,
  p_class_id uuid,
  p_gender text
)
RETURNS TABLE (
  id uuid,
  school_id uuid,
  school_name text,
  school_slug text,
  class_id uuid,
  class_name text,
  class_slug text,
  name text,
  category text,
  gender text,
  price numeric,
  base_price numeric,
  description text,
  status text,
  archived boolean,
  size_chart_title text,
  size_chart_notes text,
  size_chart_rows jsonb,
  shipping_mode text,
  shipping_fee numeric,
  free_shipping_threshold numeric,
  eta_min_business_days integer,
  eta_max_business_days integer,
  shipping_note text,
  created_at timestamptz,
  product_images jsonb,
  product_variants jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stock_totals AS (
    SELECT
      bi.variant_id,
      SUM(GREATEST(COALESCE(bi.stock, 0), 0))::integer AS total_stock
    FROM public.branch_inventory bi
    GROUP BY bi.variant_id
  ),
  active_variants AS (
    SELECT
      pv.id,
      pv.product_id,
      pv.size,
      pv.sku,
      pv.status,
      pv.low_stock_threshold,
      COALESCE(pv.price_override, pv.base_price, p.base_price, p.price, 0) AS effective_price,
      COALESCE(st.total_stock, 0) AS available_stock
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    LEFT JOIN stock_totals st ON st.variant_id = pv.id
    WHERE COALESCE(pv.is_active, true)
      AND lower(COALESCE(pv.status, 'active')) = 'active'
  )
  SELECT
    p.id,
    s.id AS school_id,
    s.name AS school_name,
    s.slug AS school_slug,
    c.id AS class_id,
    c.name AS class_name,
    c.slug AS class_slug,
    p.name,
    p.category,
    p.gender,
    p.price,
    p.base_price,
    p.description,
    p.status,
    COALESCE(p.archived, false) AS archived,
    p.size_chart_title,
    p.size_chart_notes,
    COALESCE(p.size_chart_rows, '[]'::jsonb) AS size_chart_rows,
    cfg.shipping_mode,
    cfg.shipping_fee,
    cfg.free_shipping_threshold,
    cfg.eta_min_business_days,
    cfg.eta_max_business_days,
    cfg.shipping_note,
    p.created_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pi.id,
            'product_id', pi.product_id,
            'image_url', pi.image_url,
            'storage_path', pi.storage_path,
            'is_primary', pi.is_primary,
            'sort_order', pi.sort_order,
            'created_at', pi.created_at
          )
          ORDER BY pi.is_primary DESC, pi.sort_order ASC
        )
        FROM public.product_images pi
        WHERE pi.product_id = p.id
      ),
      '[]'::jsonb
    ) AS product_images,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', av.id,
            'product_id', av.product_id,
            'size', av.size,
            'sku', av.sku,
            'status', av.status,
            'effective_price', av.effective_price,
            'available_stock', av.available_stock,
            'low_stock_threshold', av.low_stock_threshold
          )
          ORDER BY av.size ASC
        )
        FROM active_variants av
        WHERE av.product_id = p.id
      ),
      '[]'::jsonb
    ) AS product_variants
  FROM public.products p
  JOIN public.schools s ON s.id = p_school_id
  JOIN public.classes c ON c.id = p_class_id
  LEFT JOIN LATERAL (
    SELECT
      fs.shipping_mode,
      fs.shipping_fee,
      fs.free_shipping_threshold,
      fs.eta_min_business_days,
      fs.eta_max_business_days,
      fs.shipping_note
    FROM public.storefront_settings fs
    WHERE fs.school_id = p_school_id OR fs.school_id IS NULL
    ORDER BY CASE WHEN fs.school_id = p_school_id THEN 0 ELSE 1 END, fs.created_at DESC
    LIMIT 1
  ) cfg ON true
  WHERE COALESCE(p.archived, false) = false
    AND COALESCE(p.is_active, true)
    AND lower(COALESCE(p.status, 'active')) = 'active'
    AND lower(COALESCE(p.gender, 'unisex')) IN (lower(COALESCE(p_gender, 'unisex')), 'unisex')
    AND (
      EXISTS (
        SELECT 1
        FROM public.product_assignments pa
        WHERE pa.product_id = p.id
          AND pa.school_id = p_school_id
          AND pa.class_id = p_class_id
          AND lower(COALESCE(pa.gender, 'unisex')) IN (lower(COALESCE(p_gender, 'unisex')), 'unisex')
      )
      OR (
        p.school_id = p_school_id
        AND p.class_id = p_class_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM active_variants av
      WHERE av.product_id = p.id
    )
  ORDER BY p.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_store_product_detail(
  p_school_id uuid,
  p_product_id uuid
)
RETURNS TABLE (
  id uuid,
  school_id uuid,
  school_name text,
  school_slug text,
  class_id uuid,
  class_name text,
  class_slug text,
  name text,
  category text,
  gender text,
  price numeric,
  base_price numeric,
  description text,
  status text,
  archived boolean,
  size_chart_title text,
  size_chart_notes text,
  size_chart_rows jsonb,
  shipping_mode text,
  shipping_fee numeric,
  free_shipping_threshold numeric,
  eta_min_business_days integer,
  eta_max_business_days integer,
  shipping_note text,
  created_at timestamptz,
  product_images jsonb,
  product_variants jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stock_totals AS (
    SELECT
      bi.variant_id,
      SUM(GREATEST(COALESCE(bi.stock, 0), 0))::integer AS total_stock
    FROM public.branch_inventory bi
    GROUP BY bi.variant_id
  ),
  active_variants AS (
    SELECT
      pv.id,
      pv.product_id,
      pv.size,
      pv.sku,
      pv.status,
      pv.low_stock_threshold,
      COALESCE(pv.price_override, pv.base_price, p.base_price, p.price, 0) AS effective_price,
      COALESCE(st.total_stock, 0) AS available_stock
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    LEFT JOIN stock_totals st ON st.variant_id = pv.id
    WHERE COALESCE(pv.is_active, true)
      AND lower(COALESCE(pv.status, 'active')) = 'active'
  )
  SELECT
    p.id,
    COALESCE(p.school_id, p_school_id) AS school_id,
    s.name AS school_name,
    s.slug AS school_slug,
    p.class_id,
    c.name AS class_name,
    c.slug AS class_slug,
    p.name,
    p.category,
    p.gender,
    p.price,
    p.base_price,
    p.description,
    p.status,
    COALESCE(p.archived, false) AS archived,
    p.size_chart_title,
    p.size_chart_notes,
    COALESCE(p.size_chart_rows, '[]'::jsonb) AS size_chart_rows,
    cfg.shipping_mode,
    cfg.shipping_fee,
    cfg.free_shipping_threshold,
    cfg.eta_min_business_days,
    cfg.eta_max_business_days,
    cfg.shipping_note,
    p.created_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pi.id,
            'product_id', pi.product_id,
            'image_url', pi.image_url,
            'storage_path', pi.storage_path,
            'is_primary', pi.is_primary,
            'sort_order', pi.sort_order,
            'created_at', pi.created_at
          )
          ORDER BY pi.is_primary DESC, pi.sort_order ASC
        )
        FROM public.product_images pi
        WHERE pi.product_id = p.id
      ),
      '[]'::jsonb
    ) AS product_images,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', av.id,
            'product_id', av.product_id,
            'size', av.size,
            'sku', av.sku,
            'status', av.status,
            'effective_price', av.effective_price,
            'available_stock', av.available_stock,
            'low_stock_threshold', av.low_stock_threshold
          )
          ORDER BY av.size ASC
        )
        FROM active_variants av
        WHERE av.product_id = p.id
      ),
      '[]'::jsonb
    ) AS product_variants
  FROM public.products p
  LEFT JOIN public.schools s
    ON s.id = COALESCE(p.school_id, p_school_id)
  LEFT JOIN public.classes c
    ON c.id = p.class_id
  LEFT JOIN LATERAL (
    SELECT
      fs.shipping_mode,
      fs.shipping_fee,
      fs.free_shipping_threshold,
      fs.eta_min_business_days,
      fs.eta_max_business_days,
      fs.shipping_note
    FROM public.storefront_settings fs
    WHERE fs.school_id = p_school_id OR fs.school_id IS NULL
    ORDER BY CASE WHEN fs.school_id = p_school_id THEN 0 ELSE 1 END, fs.created_at DESC
    LIMIT 1
  ) cfg ON true
  WHERE p.id = p_product_id
    AND COALESCE(p.archived, false) = false
    AND COALESCE(p.is_active, true)
    AND lower(COALESCE(p.status, 'active')) = 'active'
    AND (
      p.school_id = p_school_id
      OR EXISTS (
        SELECT 1
        FROM public.product_assignments pa
        WHERE pa.product_id = p.id
          AND pa.school_id = p_school_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM active_variants av
      WHERE av.product_id = p.id
    );
$$;

REVOKE ALL ON FUNCTION public.get_store_class_products(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_class_products(uuid, uuid, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_store_product_detail(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_product_detail(uuid, uuid) TO anon, authenticated;
