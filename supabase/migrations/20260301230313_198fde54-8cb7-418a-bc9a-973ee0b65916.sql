
-- Drop all existing RESTRICTIVE policies on schools
DROP POLICY IF EXISTS "Schools are viewable by everyone" ON public.schools;
DROP POLICY IF EXISTS "Schools can be inserted by anyone" ON public.schools;
DROP POLICY IF EXISTS "Schools can be updated by anyone" ON public.schools;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Schools are viewable by everyone" ON public.schools FOR SELECT USING (true);
CREATE POLICY "Schools can be inserted by anyone" ON public.schools FOR INSERT WITH CHECK (true);
CREATE POLICY "Schools can be updated by anyone" ON public.schools FOR UPDATE USING (true);

-- Fix the same issue on products table
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Products can be inserted by anyone" ON public.products;
DROP POLICY IF EXISTS "Products can be updated by anyone" ON public.products;

CREATE POLICY "Products are viewable by everyone" ON public.products FOR SELECT USING (true);
CREATE POLICY "Products can be inserted by anyone" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Products can be updated by anyone" ON public.products FOR UPDATE USING (true);

-- Fix product_variants
DROP POLICY IF EXISTS "Variants are viewable by everyone" ON public.product_variants;
DROP POLICY IF EXISTS "Variants can be inserted by anyone" ON public.product_variants;
DROP POLICY IF EXISTS "Variants can be updated by anyone" ON public.product_variants;

CREATE POLICY "Variants are viewable by everyone" ON public.product_variants FOR SELECT USING (true);
CREATE POLICY "Variants can be inserted by anyone" ON public.product_variants FOR INSERT WITH CHECK (true);
CREATE POLICY "Variants can be updated by anyone" ON public.product_variants FOR UPDATE USING (true);

-- Fix orders
DROP POLICY IF EXISTS "Orders are viewable by everyone" ON public.orders;
DROP POLICY IF EXISTS "Orders can be inserted by anyone" ON public.orders;
DROP POLICY IF EXISTS "Orders can be updated by anyone" ON public.orders;

CREATE POLICY "Orders are viewable by everyone" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Orders can be inserted by anyone" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Orders can be updated by anyone" ON public.orders FOR UPDATE USING (true);

-- Fix order_items
DROP POLICY IF EXISTS "Order items are viewable by everyone" ON public.order_items;
DROP POLICY IF EXISTS "Order items can be inserted by anyone" ON public.order_items;

CREATE POLICY "Order items are viewable by everyone" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "Order items can be inserted by anyone" ON public.order_items FOR INSERT WITH CHECK (true);

-- Fix inventory_logs
DROP POLICY IF EXISTS "Inventory logs are viewable by everyone" ON public.inventory_logs;
DROP POLICY IF EXISTS "Inventory logs can be inserted by anyone" ON public.inventory_logs;

CREATE POLICY "Inventory logs are viewable by everyone" ON public.inventory_logs FOR SELECT USING (true);
CREATE POLICY "Inventory logs can be inserted by anyone" ON public.inventory_logs FOR INSERT WITH CHECK (true);
