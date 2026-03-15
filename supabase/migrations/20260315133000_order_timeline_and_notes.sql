-- Order timeline and admin notes

CREATE TABLE IF NOT EXISTS public.order_timeline (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_order_timeline_order_id_created_at
  ON public.order_timeline(order_id, created_at DESC);

ALTER TABLE public.order_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order timeline viewable by everyone" ON public.order_timeline;
CREATE POLICY "Order timeline viewable by everyone"
ON public.order_timeline FOR SELECT USING (true);

DROP POLICY IF EXISTS "Order timeline insert by authenticated" ON public.order_timeline;
CREATE POLICY "Order timeline insert by authenticated"
ON public.order_timeline FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.order_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_notes_order_id_created_at
  ON public.order_notes(order_id, created_at DESC);

ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order notes managed by authenticated" ON public.order_notes;
CREATE POLICY "Order notes managed by authenticated"
ON public.order_notes FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- Trigger helpers
CREATE OR REPLACE FUNCTION public.map_order_status_to_timeline_event(order_status TEXT)
RETURNS TABLE(event_type TEXT, event_description TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  CASE lower(coalesce(order_status, ''))
    WHEN 'confirmed' THEN RETURN QUERY SELECT 'PAYMENT_CONFIRMED', 'Payment confirmed';
    WHEN 'packed' THEN RETURN QUERY SELECT 'PACKED', 'Order packed';
    WHEN 'shipped' THEN RETURN QUERY SELECT 'SHIPPED', 'Order shipped';
    WHEN 'delivered' THEN RETURN QUERY SELECT 'DELIVERED', 'Order delivered';
    WHEN 'cancelled' THEN RETURN QUERY SELECT 'CANCELLED', 'Order cancelled';
    WHEN 'refunded' THEN RETURN QUERY SELECT 'REFUNDED', 'Order refunded';
    ELSE RETURN;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_order_created_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.order_timeline(order_id, event_type, description, created_by)
  VALUES (NEW.id, 'ORDER_PLACED', 'Order placed by customer', auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_created_timeline ON public.orders;
CREATE TRIGGER trg_log_order_created_timeline
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_created_timeline();

CREATE OR REPLACE FUNCTION public.log_order_status_change_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mapped_event RECORD;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO mapped_event
    FROM public.map_order_status_to_timeline_event(NEW.status)
    LIMIT 1;

    IF mapped_event.event_type IS NOT NULL THEN
      INSERT INTO public.order_timeline(order_id, event_type, description, created_by)
      VALUES (NEW.id, mapped_event.event_type, mapped_event.event_description, auth.uid());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_status_change_timeline ON public.orders;
CREATE TRIGGER trg_log_order_status_change_timeline
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_status_change_timeline();

CREATE OR REPLACE FUNCTION public.log_note_added_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.order_timeline(order_id, event_type, description, created_by)
  VALUES (NEW.order_id, 'NOTE_ADDED', 'Admin added note', NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_note_added_timeline ON public.order_notes;
CREATE TRIGGER trg_log_note_added_timeline
AFTER INSERT ON public.order_notes
FOR EACH ROW
EXECUTE FUNCTION public.log_note_added_timeline();
