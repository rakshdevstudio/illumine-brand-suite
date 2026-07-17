-- Production Hotfix: Fix Storefront Inventory Deduction
-- Replaces the `IF v_branch_id IS NOT NULL` check with global cross-branch deduction
-- when `v_branch_id` is null (Storefront).

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
  -- variables for storefront deduction
  v_qty_needed  integer;
  v_branch_record record;
  v_deduct_qty  integer;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid order payload';
  END IF;

  IF COALESCE(btrim(p_payload->>'customer_name'), '') = '' THEN
    RAISE EXCEPTION 'customer_name is required';
  END IF;

  IF COALESCE(regexp_replace(COALESCE(p_payload->>'phone', ''), '\D', '', 'g'), '') = '' THEN
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
    total_amount,
    source,
    channel,
    created_from
  )
  VALUES (
    btrim(p_payload->>'customer_name'),
    regexp_replace(COALESCE(p_payload->>'phone', ''), '\D', '', 'g'),
    COALESCE(NULLIF(btrim(p_payload->>'address'), ''), '-'),
    NULLIF(p_payload->>'school_id', '')::uuid,
    v_branch_id,
    v_payment_mode,
    'PLACED',
    0,
    p_payload->>'source',
    p_payload->>'channel',
    p_payload->>'created_from'
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
      -- Existing POS behaviour
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
    ELSE
      -- Storefront global behaviour
      v_qty_needed := (v_item->>'quantity')::integer;
      
      FOR v_branch_record IN
        SELECT branch_id, stock
        FROM public.branch_inventory
        WHERE variant_id = (v_item->>'variant_id')::uuid
          AND stock > 0
        ORDER BY stock DESC
        FOR UPDATE
      LOOP
        IF v_qty_needed <= 0 THEN
          EXIT;
        END IF;

        v_deduct_qty := LEAST(v_qty_needed, v_branch_record.stock);
        
        PERFORM public.apply_inventory_movement(
          v_branch_record.branch_id,
          (v_item->>'variant_id')::uuid,
          'OUT',
          v_deduct_qty,
          'ORDER',
          v_order_id,
          'Storefront global checkout deduction',
          auth.uid()
        );

        v_qty_needed := v_qty_needed - v_deduct_qty;
      END LOOP;

      IF v_qty_needed > 0 THEN
        RAISE EXCEPTION 'Insufficient global stock for variant %', (v_item->>'variant_id')::text;
      END IF;
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
    'status',        'PLACED'
  );
END;
$$;
