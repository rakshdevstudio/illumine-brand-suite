-- Unified order lifecycle system
-- Final flow: PLACED -> PACKED -> DISPATCHED -> DELIVERED (or CANCELLED)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'order_lifecycle_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.order_lifecycle_status AS ENUM (
      'PLACED',
      'PACKED',
      'DISPATCHED',
      'DELIVERED',
      'CANCELLED'
    );
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_log_order_status_change_timeline ON public.orders;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS packed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'dispatch_status'
  ) THEN
    EXECUTE $query$
      UPDATE public.orders o
      SET status = CASE
        WHEN lower(coalesce(o.dispatch_status, '')) = 'delivered' THEN 'DELIVERED'
        WHEN lower(coalesce(o.dispatch_status, '')) = 'dispatched' THEN 'DISPATCHED'
        WHEN lower(coalesce(o.dispatch_status, '')) = 'packed' THEN 'PACKED'
        WHEN lower(coalesce(o.status, '')) IN ('delivered') THEN 'DELIVERED'
        WHEN lower(coalesce(o.status, '')) IN ('shipped') THEN 'DISPATCHED'
        WHEN lower(coalesce(o.status, '')) IN ('packed') THEN 'PACKED'
        WHEN lower(coalesce(o.dispatch_status, '')) = 'packed' THEN 'PACKED'
        WHEN lower(coalesce(o.status, '')) IN ('confirmed') THEN 'PACKED'
        WHEN lower(coalesce(o.status, '')) IN ('cancelled', 'refunded') THEN 'CANCELLED'
        ELSE 'PLACED'
      END
    $query$;
  ELSE
    UPDATE public.orders o
    SET status = CASE
      WHEN lower(coalesce(o.status, '')) IN ('delivered') THEN 'DELIVERED'
      WHEN lower(coalesce(o.status, '')) IN ('shipped') THEN 'DISPATCHED'
      WHEN lower(coalesce(o.status, '')) IN ('packed') THEN 'PACKED'
      WHEN lower(coalesce(o.status, '')) IN ('confirmed') THEN 'PACKED'
      WHEN lower(coalesce(o.status, '')) IN ('cancelled', 'refunded') THEN 'CANCELLED'
      ELSE 'PLACED'
    END;
  END IF;
END
$$;

ALTER TABLE public.orders
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.orders
  ALTER COLUMN status TYPE public.order_lifecycle_status USING status::public.order_lifecycle_status;

ALTER TABLE public.orders
  ALTER COLUMN status SET DEFAULT 'PLACED'::public.order_lifecycle_status;

UPDATE public.orders
SET
  assigned_at = COALESCE(assigned_at, CASE WHEN status IN ('PACKED', 'DISPATCHED', 'DELIVERED') THEN updated_at ELSE NULL END),
  packed_at = COALESCE(packed_at, CASE WHEN status IN ('PACKED', 'DISPATCHED', 'DELIVERED') THEN updated_at ELSE NULL END),
  dispatched_at = COALESCE(dispatched_at, CASE WHEN status IN ('DISPATCHED', 'DELIVERED') THEN updated_at ELSE NULL END),
  delivered_at = COALESCE(delivered_at, CASE WHEN status = 'DELIVERED' THEN updated_at ELSE NULL END);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_dispatch_status_check;

DROP INDEX IF EXISTS public.orders_dispatch_status_idx;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS dispatch_status;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_lifecycle_branch_required_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_lifecycle_branch_required_check
  CHECK (
    status IN ('PLACED', 'CANCELLED')
    OR branch_id IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.set_order_lifecycle_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'PACKED' THEN
      IF NEW.packed_at IS NULL THEN NEW.packed_at := now(); END IF;
    END IF;

    IF NEW.status = 'DISPATCHED' THEN
      IF NEW.packed_at IS NULL THEN NEW.packed_at := now(); END IF;
      IF NEW.dispatched_at IS NULL THEN NEW.dispatched_at := now(); END IF;
    END IF;

    IF NEW.status = 'DELIVERED' THEN
      IF NEW.packed_at IS NULL THEN NEW.packed_at := now(); END IF;
      IF NEW.dispatched_at IS NULL THEN NEW.dispatched_at := now(); END IF;
      IF NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_lifecycle_timestamps ON public.orders;
CREATE TRIGGER trg_set_order_lifecycle_timestamps
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_lifecycle_timestamps();

CREATE OR REPLACE FUNCTION public.map_order_status_to_timeline_event(order_status TEXT)
RETURNS TABLE(event_type TEXT, event_description TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  CASE upper(coalesce(order_status, ''))
    WHEN 'PACKED' THEN RETURN QUERY SELECT 'PACKED', 'Order packed';
    WHEN 'DISPATCHED' THEN RETURN QUERY SELECT 'DISPATCHED', 'Order dispatched';
    WHEN 'DELIVERED' THEN RETURN QUERY SELECT 'DELIVERED', 'Order delivered';
    WHEN 'CANCELLED' THEN RETURN QUERY SELECT 'CANCELLED', 'Order cancelled';
    WHEN 'CONFIRMED' THEN RETURN QUERY SELECT 'PACKED', 'Order packed';
    WHEN 'SHIPPED' THEN RETURN QUERY SELECT 'DISPATCHED', 'Order dispatched';
    WHEN 'REFUNDED' THEN RETURN QUERY SELECT 'CANCELLED', 'Order cancelled';
    ELSE RETURN;
  END CASE;
END;
$$;

CREATE TRIGGER trg_log_order_status_change_timeline
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_status_change_timeline();
