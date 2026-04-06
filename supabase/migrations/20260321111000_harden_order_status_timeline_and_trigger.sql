-- Production-safe hardening for order status timeline logging.
-- Goal: status updates must not fail due to timeline function mismatch.

CREATE TABLE IF NOT EXISTS public.order_status_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
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

-- Remove older overloads that caused signature ambiguity and runtime mismatch.
DROP FUNCTION IF EXISTS public.map_order_status_to_timeline_event(TEXT);
DROP FUNCTION IF EXISTS public.map_order_status_to_timeline_event(UUID, TEXT, UUID);

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

-- Replace legacy timeline trigger function to remove dependency on removed helper signature.
CREATE OR REPLACE FUNCTION public.log_order_status_change_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type TEXT;
  v_event_description TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE upper(coalesce(NEW.status::TEXT, ''))
      WHEN 'PACKED' THEN
        v_event_type := 'PACKED';
        v_event_description := 'Order packed';
      WHEN 'DISPATCHED' THEN
        v_event_type := 'DISPATCHED';
        v_event_description := 'Order dispatched';
      WHEN 'DELIVERED' THEN
        v_event_type := 'DELIVERED';
        v_event_description := 'Order delivered';
      WHEN 'CANCELLED' THEN
        v_event_type := 'CANCELLED';
        v_event_description := 'Order cancelled';
      WHEN 'PLACED' THEN
        v_event_type := 'ORDER_PLACED';
        v_event_description := 'Order placed';
      WHEN 'CONFIRMED' THEN
        v_event_type := 'PACKED';
        v_event_description := 'Order packed';
      WHEN 'SHIPPED' THEN
        v_event_type := 'DISPATCHED';
        v_event_description := 'Order dispatched';
      WHEN 'REFUNDED' THEN
        v_event_type := 'CANCELLED';
        v_event_description := 'Order cancelled';
      WHEN 'PENDING' THEN
        v_event_type := 'ORDER_PLACED';
        v_event_description := 'Order placed';
      ELSE
        v_event_type := NULL;
        v_event_description := NULL;
    END CASE;

    IF v_event_type IS NOT NULL THEN
      INSERT INTO public.order_timeline(order_id, event_type, description, created_by)
      VALUES (NEW.id, v_event_type, v_event_description, auth.uid());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_timeline (
      order_id,
      status,
      changed_by,
      created_at
    )
    VALUES (
      NEW.id,
      NEW.status::TEXT,
      auth.uid(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_status_trigger ON public.orders;
CREATE TRIGGER order_status_trigger
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_status_change();

DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$$;
