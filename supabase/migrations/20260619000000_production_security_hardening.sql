-- 1) Remove unsafe public policies
DROP POLICY IF EXISTS "Schools are viewable by everyone" ON public.schools;
DROP POLICY IF EXISTS "Schools can be inserted by anyone" ON public.schools;
DROP POLICY IF EXISTS "Schools can be updated by anyone" ON public.schools;
DROP POLICY IF EXISTS "Schools can be deleted by anyone" ON public.schools;

DROP POLICY IF EXISTS "Classes are viewable by everyone" ON public.classes;
DROP POLICY IF EXISTS "Classes can be inserted by anyone" ON public.classes;
DROP POLICY IF EXISTS "Classes can be updated by anyone" ON public.classes;
DROP POLICY IF EXISTS "Classes can be deleted by anyone" ON public.classes;

DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Products can be inserted by anyone" ON public.products;
DROP POLICY IF EXISTS "Products can be updated by anyone" ON public.products;
DROP POLICY IF EXISTS "Products can be deleted by anyone" ON public.products;

DROP POLICY IF EXISTS "Product variants are viewable by everyone" ON public.product_variants;
DROP POLICY IF EXISTS "Product variants can be inserted by anyone" ON public.product_variants;
DROP POLICY IF EXISTS "Product variants can be updated by anyone" ON public.product_variants;
DROP POLICY IF EXISTS "Product variants can be deleted by anyone" ON public.product_variants;

DROP POLICY IF EXISTS "Product images are viewable by everyone" ON public.product_images;
DROP POLICY IF EXISTS "Product images can be inserted by anyone" ON public.product_images;
DROP POLICY IF EXISTS "Product images can be updated by anyone" ON public.product_images;
DROP POLICY IF EXISTS "Product images can be deleted by anyone" ON public.product_images;

DROP POLICY IF EXISTS "Orders are viewable by everyone" ON public.orders;
DROP POLICY IF EXISTS "Orders can be inserted by anyone" ON public.orders;
DROP POLICY IF EXISTS "Orders can be updated by anyone" ON public.orders;
DROP POLICY IF EXISTS "Orders can be deleted by anyone" ON public.orders;
DROP POLICY IF EXISTS "public_full_access_orders" ON public.orders;

DROP POLICY IF EXISTS "Order items are viewable by everyone" ON public.order_items;
DROP POLICY IF EXISTS "Order items can be inserted by anyone" ON public.order_items;
DROP POLICY IF EXISTS "Order items can be updated by anyone" ON public.order_items;
DROP POLICY IF EXISTS "Order items can be deleted by anyone" ON public.order_items;

DROP POLICY IF EXISTS "Inventory logs are viewable by everyone" ON public.inventory_logs;
DROP POLICY IF EXISTS "Inventory logs can be inserted by anyone" ON public.inventory_logs;
DROP POLICY IF EXISTS "Inventory logs can be updated by anyone" ON public.inventory_logs;
DROP POLICY IF EXISTS "Inventory logs can be deleted by anyone" ON public.inventory_logs;

-- Enable RLS (just in case)
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

-- 2) New Policies (Least Privilege)

-- Schools
CREATE POLICY "schools_select" ON public.schools FOR SELECT USING (
  status = 'active' OR public.is_backoffice_user() OR id = public.current_school_id()
);
CREATE POLICY "schools_all_backoffice" ON public.schools FOR ALL TO authenticated USING (public.is_backoffice_user()) WITH CHECK (public.is_backoffice_user());

-- Classes
CREATE POLICY "classes_select" ON public.classes FOR SELECT USING (
  status = 'active' OR public.is_backoffice_user() OR school_id = public.current_school_id()
);
CREATE POLICY "classes_all_backoffice" ON public.classes FOR ALL TO authenticated USING (public.is_backoffice_user()) WITH CHECK (public.is_backoffice_user());

-- Products
CREATE POLICY "products_select" ON public.products FOR SELECT USING (
  status = 'active' OR public.is_backoffice_user() OR school_id = public.current_school_id()
);
CREATE POLICY "products_all_backoffice" ON public.products FOR ALL TO authenticated USING (public.is_backoffice_user()) WITH CHECK (public.is_backoffice_user());

-- Product Variants
CREATE POLICY "product_variants_select" ON public.product_variants FOR SELECT USING (
  status = 'active' OR public.is_backoffice_user()
);
CREATE POLICY "product_variants_all_backoffice" ON public.product_variants FOR ALL TO authenticated USING (public.is_backoffice_user()) WITH CHECK (public.is_backoffice_user());

-- Product Images
CREATE POLICY "product_images_select" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "product_images_all_backoffice" ON public.product_images FOR ALL TO authenticated USING (public.is_backoffice_user()) WITH CHECK (public.is_backoffice_user());

-- Orders
CREATE POLICY "orders_select" ON public.orders FOR SELECT USING (
  public.is_backoffice_user() OR
  school_id = public.current_school_id() OR
  EXISTS (SELECT 1 FROM public.seller_order_items soi WHERE soi.order_id = public.orders.id AND soi.seller_id = public.current_seller_id_any_status())
);
CREATE POLICY "orders_all_backoffice" ON public.orders FOR ALL TO authenticated USING (public.is_backoffice_user()) WITH CHECK (public.is_backoffice_user());

-- Order Items
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT USING (
  public.is_backoffice_user() OR
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.school_id = public.current_school_id()) OR
  EXISTS (SELECT 1 FROM public.seller_order_items soi WHERE soi.order_id = order_id AND soi.seller_id = public.current_seller_id_any_status())
);
CREATE POLICY "order_items_all_backoffice" ON public.order_items FOR ALL TO authenticated USING (public.is_backoffice_user()) WITH CHECK (public.is_backoffice_user());

-- Inventory Logs
CREATE POLICY "inventory_logs_select" ON public.inventory_logs FOR SELECT TO authenticated USING (public.is_backoffice_user());
CREATE POLICY "inventory_logs_all_backoffice" ON public.inventory_logs FOR ALL TO authenticated USING (public.is_backoffice_user()) WITH CHECK (public.is_backoffice_user());

-- 3) Protect reporting layer dynamically for existing views
DO $$
DECLARE
  v_view text;
BEGIN
  FOR v_view IN 
    SELECT table_name 
    FROM information_schema.views 
    WHERE table_schema = 'public' 
      AND table_name IN (
        'sales_item_report_view',
        'sales_report_view',
        'gst_report_view',
        'inventory_report_view',
        'branch_report_view',
        'v_sales_gst_summary',
        'v_purchase_gst_summary',
        'v_customer_outstanding',
        'view_gst_summary',
        'view_revenue_summary',
        'view_outstanding_summary',
        'view_aging_buckets',
        'view_dashboard_financial_kpis',
        'v_invoice_outstanding',
        'v_outstanding_aging',
        'v_outstanding_dashboard_summary'
      )
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon;', v_view);
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true);', v_view);
  END LOOP;
END
$$;

-- 4) Fix Supabase storage policies for "product-images" bucket
DROP POLICY IF EXISTS "Anyone can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Product images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete product images" ON storage.objects;

CREATE POLICY "product_images_public_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'product-images'
);

CREATE POLICY "product_images_backoffice_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'product-images' AND public.is_backoffice_user()
);

CREATE POLICY "product_images_backoffice_update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'product-images' AND public.is_backoffice_user()
) WITH CHECK (
  bucket_id = 'product-images' AND public.is_backoffice_user()
);

CREATE POLICY "product_images_backoffice_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'product-images' AND public.is_backoffice_user()
);
