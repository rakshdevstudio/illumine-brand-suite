-- Ensure status timeline RPC and storage exist for order lifecycle updates.

CREATE TABLE IF NOT EXISTS public.order_status_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_timeline_order_created_at
  ON public.order_status_timeline(order_id, created_at DESC);

ALTER TABLE public.order_status_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order status timeline viewable by everyone" ON public.order_status_timeline;
CREATE POLICY "Order status timeline viewable by everyone"
ON public.order_status_timeline FOR SELECT USING (true);

DROP POLICY IF EXISTS "Order status timeline insert by authenticated" ON public.order_status_timeline;
CREATE POLICY "Order status timeline insert by authenticated"
ON public.order_status_timeline FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.map_order_status_to_timeline_event(order_status TEXT)
RETURNS TABLE(event_type TEXT, event_description TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  CASE upper(coalesce(order_status, ''))
    WHEN 'ASSIGNED' THEN RETURN QUERY SELECT 'ASSIGNED', 'Order assigned to branch';
    WHEN 'PACKED' THEN RETURN QUERY SELECT 'PACKED', 'Order packed';
    WHEN 'DISPATCHED' THEN RETURN QUERY SELECT 'DISPATCHED', 'Order dispatched';
    WHEN 'DELIVERED' THEN RETURN QUERY SELECT 'DELIVERED', 'Order delivered';
    WHEN 'CANCELLED' THEN RETURN QUERY SELECT 'CANCELLED', 'Order cancelled';
    WHEN 'PLACED' THEN RETURN QUERY SELECT 'ORDER_PLACED', 'Order placed';
    WHEN 'CONFIRMED' THEN RETURN QUERY SELECT 'ASSIGNED', 'Order assigned to branch';
    WHEN 'SHIPPED' THEN RETURN QUERY SELECT 'DISPATCHED', 'Order dispatched';
    WHEN 'REFUNDED' THEN RETURN QUERY SELECT 'CANCELLED', 'Order cancelled';
    WHEN 'PENDING' THEN RETURN QUERY SELECT 'ORDER_PLACED', 'Order placed';
    ELSE RETURN;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.map_order_status_to_timeline_event(
  p_order_id UUID,
  p_status TEXT,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_status_timeline (
    order_id,
    status,
    changed_by,
    created_at
  )
  VALUES (
    p_order_id,
    p_status,
    p_user_id,
    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.map_order_status_to_timeline_event(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_order_status_to_timeline_event(UUID, TEXT, UUID) TO anon;

CREATE OR REPLACE FUNCTION public.log_order_status_change_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_timeline(order_id, status, changed_by, created_at)
    VALUES (NEW.id, NEW.status::TEXT, auth.uid(), now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_status_change_audit ON public.orders;
CREATE TRIGGER trg_log_order_status_change_audit
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_status_change_audit();
