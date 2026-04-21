-- Backfill invoices for historical successful orders.
-- Safe to run multiple times because create_invoice_from_order is idempotent per order.

DO $$
DECLARE
  v_order record;
BEGIN
  FOR v_order IN
    SELECT o.id
    FROM public.orders o
    WHERE upper(COALESCE(o.status::text, '')) IN (
      'PLACED',
      'PACKED',
      'DISPATCHED',
      'DELIVERED',
      'PENDING',
      'CONFIRMED',
      'SHIPPED'
    )
      AND EXISTS (
        SELECT 1
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      )
  LOOP
    PERFORM public.create_invoice_from_order(v_order.id);
  END LOOP;
END
$$;

-- Extra reconciliation for legacy rows where invoice exists but orders.invoice_id was never set.
UPDATE public.orders o
SET invoice_id = i.id
FROM public.invoices i
WHERE i.order_id = o.id
  AND o.invoice_id IS NULL;
