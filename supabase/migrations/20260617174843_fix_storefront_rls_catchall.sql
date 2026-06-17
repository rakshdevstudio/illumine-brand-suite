-- Ensure schema permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Ensure table permissions
GRANT ALL ON TABLE public.orders TO anon, authenticated;
GRANT ALL ON TABLE public.order_items TO anon, authenticated;
GRANT ALL ON TABLE public.order_notes TO anon, authenticated;
GRANT ALL ON TABLE public.order_timeline TO anon, authenticated;

-- Ensure permissive RLS
DO $$
BEGIN
  -- orders
  DROP POLICY IF EXISTS "public_full_access_orders" ON public.orders;
  CREATE POLICY "public_full_access_orders" ON public.orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

  -- order_items
  DROP POLICY IF EXISTS "public_full_access_order_items" ON public.order_items;
  CREATE POLICY "public_full_access_order_items" ON public.order_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

  -- order_notes
  DROP POLICY IF EXISTS "public_full_access_order_notes" ON public.order_notes;
  CREATE POLICY "public_full_access_order_notes" ON public.order_notes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  
  -- order_timeline
  DROP POLICY IF EXISTS "public_full_access_order_timeline" ON public.order_timeline;
  CREATE POLICY "public_full_access_order_timeline" ON public.order_timeline FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
END
$$;

-- Reload postgrest schema
NOTIFY pgrst, 'reload schema';
