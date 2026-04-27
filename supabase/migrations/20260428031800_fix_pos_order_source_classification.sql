-- ===========================================================================
-- Fix POS order source classification
-- ===========================================================================
-- Root cause (found 2026-04-28):
--
--   Migration 20260327120000_reporting_engine_foundation.sql contained a
--   backfill that ran:
--
--       UPDATE public.orders
--       SET    payment_mode = 'ONLINE'
--       WHERE  payment_mode IS NULL
--         AND  coalesce(email, '') <> '';
--
--   This incorrectly marked every POS order that happened to have an email
--   address as ONLINE, because the email column exists for both ecommerce
--   and POS (POS can attach a customer with an email to an order).
--
--   Additionally, the create_order() RPC does not forward payment_mode from
--   the caller's payload, so orders placed through that RPC always landed
--   with the column default ('UNKNOWN'), which the admin UI then also
--   displayed as Online (fallthrough default).
--
-- This migration fixes both issues:
--   1. Re-backfill existing orders using order_notes evidence ("Order Source:
--      POS" and "Payment Method: X") so that legacy POS rows get the correct
--      CASH/UPI/CARD value instead of ONLINE.
--   2. Replace the create_order() RPC to honour an explicit payment_mode
--      field in the caller payload (used by the POS app direct-insert path
--      as a safety net, and future callers).
--   3. Add a BEFORE INSERT trigger on orders that normalises payment_mode so
--      that any future raw insert from a POS client that passes a lowercase
--      value (e.g. 'cash') is automatically uppercased and validated.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Re-backfill legacy POS orders that were incorrectly set to 'ONLINE'
-- ---------------------------------------------------------------------------

-- Step 1a: Correct the payment mode for orders that have explicit note evidence.
WITH payment_note_map AS (
  SELECT
    on2.order_id,
    max(
      CASE
        WHEN on2.note ILIKE '%Payment Method: UPI%'    THEN 'UPI'
        WHEN on2.note ILIKE '%Payment Method: CASH%'   THEN 'CASH'
        WHEN on2.note ILIKE '%Payment Method: CARD%'   THEN 'CARD'
        WHEN on2.note ILIKE '%Payment Method: BANK%'   THEN 'BANK_TRANSFER'
        WHEN on2.note ILIKE '%Payment Method: ONLINE%' THEN 'ONLINE'
        ELSE NULL
      END
    ) AS parsed_payment_mode,
    bool_or(on2.note ILIKE '%Order Source: POS%') AS is_pos
  FROM public.order_notes on2
  GROUP BY on2.order_id
)
UPDATE public.orders o
SET    payment_mode = COALESCE(
         pnm.parsed_payment_mode,
         CASE WHEN pnm.is_pos THEN 'CASH' ELSE o.payment_mode END
       )
FROM   payment_note_map pnm
WHERE  pnm.order_id = o.id
  -- Only touch orders that have POS evidence and are currently wrong
  AND  pnm.is_pos = true
  AND  o.payment_mode IN ('ONLINE', 'UNKNOWN');

-- Step 1b: Any remaining POS order (no notes yet, but has a branch_id AND
-- no email / has an address that starts with 'POS Counter') that is still
-- ONLINE gets corrected to UNKNOWN (safer than guessing a payment mode).
-- This covers very old orders created before notes were written.
UPDATE public.orders
SET    payment_mode = 'UNKNOWN'
WHERE  payment_mode = 'ONLINE'
  AND  branch_id IS NOT NULL
  AND  (
    address ILIKE 'POS Counter%'
    OR coalesce(email, '') = ''
  );

-- ---------------------------------------------------------------------------
-- 2) Harden the create_order() RPC to accept payment_mode from the payload
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id    uuid;
  v_item        jsonb;
  v_total       numeric(12,2) := 0;
  v_branch_id   uuid;
  v_raw_mode    text;
  v_payment_mode text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid order payload';
  END IF;

  IF COALESCE(btrim(p_payload->>'customer_name'), '') = '' THEN
    RAISE EXCEPTION 'customer_name is required';
  END IF;

  IF COALESCE(regexp_replace(COALESCE(p_payload->>'phone', ''), '\\D', '', 'g'), '') = '' THEN
    RAISE EXCEPTION 'phone is required';
  END IF;

  IF COALESCE(jsonb_typeof(p_payload->'items'), '') <> 'array' OR jsonb_array_length(p_payload->'items') = 0 THEN
    RAISE EXCEPTION 'items are required';
  END IF;

  v_branch_id := NULLIF(p_payload->>'branch_id', '')::uuid;

  -- Resolve payment_mode from payload; default to UNKNOWN.
  -- POS orders will pass 'CASH', 'UPI', etc. (or lowercase equivalents).
  -- Website checkout passes 'ONLINE'.
  v_raw_mode := upper(btrim(COALESCE(p_payload->>'payment_mode', 'UNKNOWN')));
  v_payment_mode := CASE
    WHEN v_raw_mode IN ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'BANK')
      THEN CASE WHEN v_raw_mode = 'BANK' THEN 'BANK_TRANSFER' ELSE v_raw_mode END
    ELSE 'UNKNOWN'
  END;

  INSERT INTO public.orders (
    customer_name,
    phone,
    address,
    school_id,
    branch_id,
    payment_mode,
    status,
    total_amount
  )
  VALUES (
    btrim(p_payload->>'customer_name'),
    regexp_replace(COALESCE(p_payload->>'phone', ''), '\\D', '', 'g'),
    COALESCE(NULLIF(btrim(p_payload->>'address'), ''), '-'),
    NULLIF(p_payload->>'school_id', '')::uuid,
    v_branch_id,
    v_payment_mode,
    'pending',
    0
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    IF COALESCE((v_item->>'quantity')::integer, 0) <= 0 THEN
      RAISE EXCEPTION 'Item quantity must be > 0';
    END IF;

    IF COALESCE((v_item->>'unit_price')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Item unit_price cannot be negative';
    END IF;

    INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, price)
    VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'variant_id')::uuid,
      (v_item->>'quantity')::integer,
      round((v_item->>'unit_price')::numeric, 2)
    );

    v_total := v_total + (v_item->>'quantity')::integer * round((v_item->>'unit_price')::numeric, 2);

    IF v_branch_id IS NOT NULL THEN
      PERFORM public.apply_inventory_movement(
        v_branch_id,
        (v_item->>'variant_id')::uuid,
        'OUT',
        (v_item->>'quantity')::integer,
        'ORDER',
        v_order_id,
        'Order checkout deduction',
        auth.uid()
      );
    END IF;
  END LOOP;

  UPDATE public.orders
  SET total_amount = round(v_total, 2),
      updated_at   = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id',      v_order_id,
    'total_amount',  round(v_total, 2),
    'payment_mode',  v_payment_mode,
    'status',        'pending'
  );
END;
$$;

-- Re-grant (idempotent)
GRANT EXECUTE ON FUNCTION public.create_order(jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) BEFORE INSERT trigger to normalise payment_mode on the orders table
-- ---------------------------------------------------------------------------
-- This ensures that ANY future raw insert (whether through Supabase client,
-- RPC, or direct psql) normalises the value and never lets a POS order slip
-- through as ONLINE unless the caller explicitly intended that.

CREATE OR REPLACE FUNCTION public.trg_normalise_order_payment_mode()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw  text := upper(btrim(COALESCE(NEW.payment_mode, 'UNKNOWN')));
BEGIN
  NEW.payment_mode := CASE
    WHEN v_raw IN ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'ONLINE') THEN v_raw
    WHEN v_raw = 'BANK' THEN 'BANK_TRANSFER'
    ELSE 'UNKNOWN'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalise_order_payment_mode ON public.orders;
CREATE TRIGGER trg_normalise_order_payment_mode
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_normalise_order_payment_mode();
