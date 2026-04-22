-- Finalize storefront invoice creation flow.
--
-- Purpose:
-- - Disable legacy invoice creation on each order_items insert
-- - Keep invoice creation explicit after checkout item assembly
-- - Preserve the latest invoice rebuild + validation logic
-- - Keep the legacy camelCase RPC wrapper working

DROP TRIGGER IF EXISTS trg_order_items_create_invoice ON public.order_items;

CREATE OR REPLACE FUNCTION public.trg_order_items_create_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing_invoice_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_existing_invoice_number text;
  v_item_count integer := 0;
  v_subtotal numeric := 0;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_total numeric := 0;
  v_address text;
  v_item record;
  v_calc jsonb;
  v_ledger_entry_id uuid;
  v_ledger_lines jsonb;
  v_branch_id uuid;
  v_order_total numeric := 0;
  v_has_invoice_payments boolean := false;
  v_has_payment_rows boolean := false;
  v_has_payment_ledger boolean := false;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF upper(COALESCE(v_order.status::text, '')) NOT IN ('PLACED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'PENDING', 'CONFIRMED', 'SHIPPED') THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.bypass_invoice_guard', 'on', true);

  v_order_total := round(COALESCE(v_order.total_amount, 0), 2);

  SELECT i.id, i.invoice_number
  INTO v_existing_invoice_id, v_existing_invoice_number
  FROM public.invoices i
  WHERE i.order_id = p_order_id
  LIMIT 1;

  IF v_existing_invoice_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.invoice_payments ip
      WHERE ip.invoice_id = v_existing_invoice_id
    )
    INTO v_has_invoice_payments;

    SELECT EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.reference_type = 'invoice'
        AND p.reference_id = v_existing_invoice_id
    )
    INTO v_has_payment_rows;

    SELECT EXISTS (
      SELECT 1
      FROM public.ledger_entries le
      WHERE le.reference_type = 'payment'
        AND le.reference_id = v_existing_invoice_id
    )
    INTO v_has_payment_ledger;

    IF v_has_invoice_payments OR v_has_payment_rows OR v_has_payment_ledger THEN
      RAISE EXCEPTION 'Cannot recreate invoice %. Payment history exists for order %', v_existing_invoice_id, p_order_id;
    END IF;

    PERFORM set_config('app.bypass_ledger_guard', 'on', true);

    DELETE FROM public.ledger_entries
    WHERE reference_type = 'invoice'
      AND reference_id = v_existing_invoice_id;

    DELETE FROM public.invoice_items
    WHERE invoice_id = v_existing_invoice_id;

    DELETE FROM public.invoices
    WHERE id = v_existing_invoice_id;
  END IF;

  FOR v_item IN
    SELECT
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.price,
      COALESCE(p.gst_percentage, 0) AS gst_percentage,
      COALESCE(pv.pricing_type, 'inclusive') AS pricing_type
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_item_count := v_item_count + 1;

    v_calc := public.compute_gst_line_values(
      COALESCE(v_item.quantity, 0),
      COALESCE(v_item.price, 0),
      COALESCE(v_item.gst_percentage, 0),
      COALESCE(v_item.pricing_type, 'inclusive'),
      false
    );

    v_subtotal := round(v_subtotal + (v_calc->>'taxable')::numeric, 2);
    v_cgst := round(v_cgst + (v_calc->>'cgst')::numeric, 2);
    v_sgst := round(v_sgst + (v_calc->>'sgst')::numeric, 2);
    v_total := round(v_total + (v_calc->>'total')::numeric, 2);

    RAISE NOTICE 'Invoice item total: %', round((v_calc->>'total')::numeric, 2);
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Cannot create invoice for order % without items', p_order_id;
  END IF;

  RAISE NOTICE 'Invoice final total: %, Order total: %', round(v_total, 2), v_order_total;

  IF abs(v_total - v_order_total) > 0.01 THEN
    RAISE EXCEPTION 'Invoice total mismatch: invoice_total=%, order_total=%', round(v_total, 2), v_order_total;
  END IF;

  v_invoice_number := COALESCE(v_existing_invoice_number, public.next_invoice_number(COALESCE(v_order.created_at, now())));
  v_address := concat_ws(', ', NULLIF(v_order.address, ''), NULLIF(v_order.city, ''), NULLIF(v_order.pincode, ''));

  INSERT INTO public.invoices (
    id,
    order_id,
    invoice_number,
    customer_name,
    phone,
    address,
    subtotal,
    cgst,
    sgst,
    total,
    paid_amount,
    balance_amount,
    status,
    created_at
  )
  VALUES (
    COALESCE(v_existing_invoice_id, gen_random_uuid()),
    p_order_id,
    v_invoice_number,
    COALESCE(v_order.customer_name, ''),
    COALESCE(v_order.phone, ''),
    COALESCE(NULLIF(v_address, ''), COALESCE(v_order.address, '')),
    round(v_subtotal, 2),
    round(v_cgst, 2),
    round(v_sgst, 2),
    round(v_total, 2),
    0,
    round(v_total, 2),
    'issued',
    COALESCE(v_order.created_at, now())
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.price,
      COALESCE(p.gst_percentage, 0) AS gst_percentage,
      COALESCE(pv.pricing_type, 'inclusive') AS pricing_type
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_calc := public.compute_gst_line_values(
      COALESCE(v_item.quantity, 0),
      COALESCE(v_item.price, 0),
      COALESCE(v_item.gst_percentage, 0),
      COALESCE(v_item.pricing_type, 'inclusive'),
      false
    );

    INSERT INTO public.invoice_items (
      invoice_id,
      product_id,
      variant_id,
      quantity,
      unit_price,
      gst_percentage,
      cgst_amount,
      sgst_amount,
      total
    )
    VALUES (
      v_invoice_id,
      v_item.product_id,
      v_item.variant_id,
      v_item.quantity,
      round(COALESCE(v_item.price, 0)::numeric, 2),
      round(COALESCE(v_item.gst_percentage, 0)::numeric, 2),
      round((v_calc->>'cgst')::numeric, 2),
      round((v_calc->>'sgst')::numeric, 2),
      round((v_calc->>'total')::numeric, 2)
    );
  END LOOP;

  v_ledger_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1200', 'debit', round(v_total, 2), 'credit', 0),
    jsonb_build_object('account_code', '3100', 'debit', 0, 'credit', round(v_subtotal, 2)),
    CASE WHEN round(v_cgst, 2) > 0 THEN
      jsonb_build_object('account_code', '2101', 'debit', 0, 'credit', round(v_cgst, 2))
    ELSE NULL::jsonb END,
    CASE WHEN round(v_sgst, 2) > 0 THEN
      jsonb_build_object('account_code', '2102', 'debit', 0, 'credit', round(v_sgst, 2))
    ELSE NULL::jsonb END
  ) - ARRAY(SELECT NULL);

  v_branch_id := COALESCE(v_order.branch_id, NULL);

  v_ledger_entry_id := public.create_balanced_ledger_entry(
    p_reference_type => 'invoice',
    p_reference_id => v_invoice_id,
    p_entry_date => COALESCE(v_order.created_at::date, CURRENT_DATE),
    p_branch_id => v_branch_id,
    p_description => 'Invoice ' || v_invoice_number || ' from order ' || p_order_id || ' | Customer: ' || COALESCE(v_order.customer_name, 'N/A'),
    p_lines => v_ledger_lines
  );

  UPDATE public.orders
  SET invoice_id = v_invoice_id
  WHERE id = p_order_id;

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public."createInvoiceFromOrder"(order_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_invoice_from_order(order_id);
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_from_order(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public."createInvoiceFromOrder"(uuid) TO anon, authenticated;
