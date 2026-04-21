-- Fix purchase GST regime resolution when branch state is missing.
-- Allows seller_state_code payload fallback while preserving admin-only enforcement.

CREATE OR REPLACE FUNCTION public.create_purchase_with_ledger(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id uuid;
  v_purchase_no text;
  v_item jsonb;
  v_subtotal numeric(12,2) := 0;
  v_cgst numeric(12,2) := 0;
  v_sgst numeric(12,2) := 0;
  v_igst numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_line_base numeric(12,2);
  v_line_tax numeric(12,2);
  v_branch_id uuid;
  v_vendor_id uuid;
  v_seller_state text;
  v_vendor_state text;
  v_is_interstate boolean;
  v_ledger_id uuid;
  v_inventory_account text := COALESCE(NULLIF(p_payload->>'inventory_account_code', ''), '1000');
  v_payable_account text := COALESCE(NULLIF(p_payload->>'payable_account_code', ''), '2200');
  v_branch record;
  v_vendor record;
BEGIN
  PERFORM public.assert_finance_admin();

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid purchase payload';
  END IF;

  v_vendor_id := NULLIF(p_payload->>'vendor_id', '')::uuid;
  v_branch_id := NULLIF(p_payload->>'branch_id', '')::uuid;

  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'vendor_id is required';
  END IF;

  IF COALESCE(jsonb_typeof(p_payload->'items'), '') <> 'array' OR jsonb_array_length(p_payload->'items') = 0 THEN
    RAISE EXCEPTION 'items are required';
  END IF;

  SELECT b.id, public.normalize_state_code(b.state_code) AS state_code
  INTO v_branch
  FROM public.branches b
  WHERE b.id = v_branch_id;

  SELECT v.id, public.normalize_state_code(v.state_code) AS state_code
  INTO v_vendor
  FROM public.vendors v
  WHERE v.id = v_vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor % not found', v_vendor_id;
  END IF;

  v_seller_state := COALESCE(v_branch.state_code, public.normalize_state_code(p_payload->>'seller_state_code'));
  v_vendor_state := COALESCE(v_vendor.state_code, public.normalize_state_code(p_payload->>'vendor_state_code'));

  IF v_seller_state IS NULL OR v_vendor_state IS NULL THEN
    RAISE EXCEPTION 'Cannot determine purchase GST regime. Missing seller/vendor state';
  END IF;

  v_is_interstate := (v_seller_state <> v_vendor_state);

  v_purchase_no := public.next_purchase_number(COALESCE(NULLIF(p_payload->>'purchase_date', '')::date, CURRENT_DATE));

  INSERT INTO public.purchases (
    purchase_number,
    vendor_id,
    branch_id,
    status,
    purchase_date,
    due_date,
    notes,
    created_by,
    seller_state_code,
    vendor_state_code,
    is_interstate
  )
  VALUES (
    v_purchase_no,
    v_vendor_id,
    v_branch_id,
    COALESCE(NULLIF(p_payload->>'status', '')::public.purchase_status, 'received'::public.purchase_status),
    COALESCE(NULLIF(p_payload->>'purchase_date', '')::date, CURRENT_DATE),
    NULLIF(p_payload->>'due_date', '')::date,
    NULLIF(p_payload->>'notes', ''),
    auth.uid(),
    v_seller_state,
    v_vendor_state,
    v_is_interstate
  )
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    IF COALESCE((v_item->>'quantity')::integer, 0) <= 0 THEN
      RAISE EXCEPTION 'Purchase item quantity must be > 0';
    END IF;

    IF COALESCE((v_item->>'unit_cost')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Purchase unit_cost cannot be negative';
    END IF;

    v_line_base := ROUND((v_item->>'quantity')::integer * (v_item->>'unit_cost')::numeric, 2);
    v_line_tax := ROUND(v_line_base * COALESCE((v_item->>'gst_percentage')::numeric, 0) / 100.0, 2);

    INSERT INTO public.purchase_items (
      purchase_id,
      product_id,
      variant_id,
      quantity,
      unit_cost,
      gst_percentage,
      cgst_amount,
      sgst_amount,
      igst_amount,
      line_total
    )
    VALUES (
      v_purchase_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'variant_id')::uuid,
      (v_item->>'quantity')::integer,
      ROUND((v_item->>'unit_cost')::numeric, 2),
      ROUND(COALESCE((v_item->>'gst_percentage')::numeric, 0), 2),
      CASE WHEN v_is_interstate THEN 0 ELSE ROUND(v_line_tax / 2.0, 2) END,
      CASE WHEN v_is_interstate THEN 0 ELSE ROUND(v_line_tax - (v_line_tax / 2.0), 2) END,
      CASE WHEN v_is_interstate THEN ROUND(v_line_tax, 2) ELSE 0 END,
      ROUND(v_line_base + v_line_tax, 2)
    );

    v_subtotal := v_subtotal + v_line_base;

    IF v_is_interstate THEN
      v_igst := v_igst + ROUND(v_line_tax, 2);
    ELSE
      v_cgst := v_cgst + ROUND(v_line_tax / 2.0, 2);
      v_sgst := v_sgst + ROUND(v_line_tax - (v_line_tax / 2.0), 2);
    END IF;

    IF v_branch_id IS NOT NULL THEN
      PERFORM public.apply_inventory_movement(
        v_branch_id,
        (v_item->>'variant_id')::uuid,
        'IN',
        (v_item->>'quantity')::integer,
        'SYSTEM',
        v_purchase_id,
        'Purchase receiving stock increase',
        auth.uid()
      );
    END IF;
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);
  v_cgst := ROUND(v_cgst, 2);
  v_sgst := ROUND(v_sgst, 2);
  v_igst := ROUND(v_igst, 2);
  v_total := ROUND(v_subtotal + v_cgst + v_sgst + v_igst, 2);

  UPDATE public.purchases
  SET
    subtotal = v_subtotal,
    cgst = v_cgst,
    sgst = v_sgst,
    igst = v_igst,
    total = v_total,
    status = 'received',
    updated_at = now()
  WHERE id = v_purchase_id;

  v_ledger_id := public.create_balanced_ledger_entry(
    'purchase',
    v_purchase_id,
    CURRENT_DATE,
    v_branch_id,
    'Purchase booking entry',
    (
      jsonb_build_array(
        jsonb_build_object('account_code', v_inventory_account, 'debit', v_subtotal, 'credit', 0)
      )
      || CASE WHEN v_cgst > 0 THEN jsonb_build_array(jsonb_build_object('account_code', '1210', 'debit', v_cgst, 'credit', 0)) ELSE '[]'::jsonb END
      || CASE WHEN v_sgst > 0 THEN jsonb_build_array(jsonb_build_object('account_code', '1211', 'debit', v_sgst, 'credit', 0)) ELSE '[]'::jsonb END
      || CASE WHEN v_igst > 0 THEN jsonb_build_array(jsonb_build_object('account_code', '1212', 'debit', v_igst, 'credit', 0)) ELSE '[]'::jsonb END
      || jsonb_build_array(
        jsonb_build_object('account_code', v_payable_account, 'debit', 0, 'credit', v_total)
      )
    )
  );

  PERFORM public.log_financial_action(
    'create_purchase_with_ledger',
    'purchase',
    v_purchase_id,
    jsonb_build_object(
      'ledger_entry_id', v_ledger_id,
      'subtotal', v_subtotal,
      'cgst', v_cgst,
      'sgst', v_sgst,
      'igst', v_igst,
      'total', v_total,
      'is_interstate', v_is_interstate
    )
  );

  RETURN jsonb_build_object(
    'purchase_id', v_purchase_id,
    'purchase_number', v_purchase_no,
    'ledger_entry_id', v_ledger_id,
    'subtotal', v_subtotal,
    'cgst', v_cgst,
    'sgst', v_sgst,
    'igst', v_igst,
    'total', v_total,
    'is_interstate', v_is_interstate
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_purchase_with_ledger(jsonb) TO authenticated;
