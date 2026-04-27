-- Fix missing RLS policies for ecommerce (public access)
-- Do not disable RLS globally, only add anon read/insert access

-- 1. Allow public read on products
DROP POLICY IF EXISTS "public read products" ON products;
CREATE POLICY "public read products"
ON products FOR SELECT
USING (true);

-- 2. Allow public read on classes
DROP POLICY IF EXISTS "public read classes" ON classes;
CREATE POLICY "public read classes"
ON classes FOR SELECT
USING (true);

-- 3. Allow public insert on orders
DROP POLICY IF EXISTS "public insert orders" ON orders;
CREATE POLICY "public insert orders"
ON orders FOR INSERT
WITH CHECK (true);

-- 4. Allow public insert on order_items
DROP POLICY IF EXISTS "public insert order_items" ON order_items;
CREATE POLICY "public insert order_items"
ON order_items FOR INSERT
WITH CHECK (true);

-- 5. Allow ecommerce app (anon) to invoke invoice creation RPC.
-- The function is already declared as SECURITY DEFINER in migration
-- 20260423111000_checkout_invoice_finalization_flow.sql; we only need
-- to grant EXECUTE to the anon role.
GRANT EXECUTE ON FUNCTION public.create_invoice_from_order(uuid) TO anon;

