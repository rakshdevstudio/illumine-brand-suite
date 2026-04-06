-- Remove the legacy ASSIGNED order status from live data and timelines.
-- Existing orders are promoted to PACKED so the system only exposes the new lifecycle state.

UPDATE public.orders
SET status = 'PACKED'
WHERE upper(coalesce(status::text, '')) = 'ASSIGNED';

UPDATE public.order_timeline
SET
  event_type = 'PACKED',
  description = 'Order packed'
WHERE upper(coalesce(event_type, '')) = 'ASSIGNED';

UPDATE public.order_status_timeline
SET status = 'PACKED'
WHERE upper(coalesce(status::text, '')) = 'ASSIGNED';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'dispatch_status'
  ) THEN
    UPDATE public.orders
    SET dispatch_status = 'packed'
    WHERE lower(coalesce(dispatch_status, '')) = 'assigned';
  END IF;
END
$$;
