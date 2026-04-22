CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing_invoice_id uuid;
  v_existing_invoice_number text;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item_count integer := 0;
  v_subtotal numeric := 0;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_total numeric := 0;
  v_authoritative_total numeric := 0;
  v_address text;
  v_item record;
  v_calc jsonb;
  v_ledger_entry_id uuid;
  v_ledger_lines jsonb;
  v_branch_id uuid;
  v_has_invoice_payments boolean := false;
  v_has_payment_rows boolean := false;
  v_has_payment_ledger boolean := false;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF upper(COALESCE(v_order.status::text, '')) NOT IN ('PLACED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'PENDING', 'CONFIRMED', 'SHIPPED') THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.bypass_invoice_guard', 'on', true);

  PERFORM 1
  FROM public.order_items
  WHERE order_id = p_order_id
  FOR UPDATE;

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
      UPDATE public.orders
      SET invoice_id = COALESCE(invoice_id, v_existing_invoice_id)
      WHERE id = p_order_id;

      RETURN v_existing_invoice_id;
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

  SELECT ROUND(
           COALESCE(
             SUM(
               (
                 public.compute_gst_line_values(
                   oi.quantity,
                   oi.price,
                   COALESCE(p.gst_percentage, 0),
                   COALESCE(pv.pricing_type, 'inclusive'),
                   false
                 )->>'total'
               )::numeric
             ),
             0
           ),
           2
         )
  INTO v_authoritative_total
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id
  LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
  WHERE oi.order_id = p_order_id;

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
      v_item.quantity,
      v_item.price,
      v_item.gst_percentage,
      v_item.pricing_type,
      false
    );

    v_subtotal := round(v_subtotal + (v_calc->>'taxable')::numeric, 2);
    v_cgst := round(v_cgst + (v_calc->>'cgst')::numeric, 2);
    v_sgst := round(v_sgst + (v_calc->>'sgst')::numeric, 2);
    v_total := round(v_total + (v_calc->>'total')::numeric, 2);

    RAISE NOTICE 'Item total: %', (v_calc->>'total');
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'No items for order %', p_order_id;
  END IF;

  v_total := ROUND(COALESCE(v_authoritative_total, 0), 2);

  RAISE NOTICE 'Final total: %, Order total: %', v_total, COALESCE(v_order.total_amount, 0);

  IF abs(v_total - COALESCE(v_order.total_amount, 0)) > 0.01 THEN
    RETURN NULL;
  END IF;

  v_invoice_number := COALESCE(
    v_existing_invoice_number,
    public.next_invoice_number(COALESCE(v_order.created_at, now()))
  );

  v_address := concat_ws(
    ', ',
    NULLIF(v_order.address, ''),
    NULLIF(v_order.city, ''),
    NULLIF(v_order.pincode, '')
  );

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
    COALESCE(NULLIF(v_address, ''), v_order.address),
    ROUND(v_subtotal, 2),
    ROUND(v_cgst, 2),
    ROUND(v_sgst, 2),
    ROUND(v_total, 2),
    0,
    ROUND(v_total, 2),
    'issued',
    COALESCE(v_order.created_at, now())
  )
  RETURNING id INTO v_invoice_id;

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
  SELECT
    v_invoice_id,
    oi.product_id,
    oi.variant_id,
    oi.quantity,
    round(oi.price, 2),
    round(COALESCE(p.gst_percentage, 0), 2),
    round((calc->>'cgst')::numeric, 2),
    round((calc->>'sgst')::numeric, 2),
    round((calc->>'total')::numeric, 2)
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id
  LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
  CROSS JOIN LATERAL public.compute_gst_line_values(
    oi.quantity,
    oi.price,
    COALESCE(p.gst_percentage, 0),
    COALESCE(pv.pricing_type, 'inclusive'),
    false
  ) calc
  WHERE oi.order_id = p_order_id;

  v_ledger_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1200', 'debit', ROUND(v_total, 2), 'credit', 0),
    jsonb_build_object('account_code', '3100', 'debit', 0, 'credit', ROUND(v_subtotal, 2)),
    CASE WHEN ROUND(v_cgst, 2) > 0 THEN
      jsonb_build_object('account_code', '2101', 'debit', 0, 'credit', ROUND(v_cgst, 2))
    ELSE NULL::jsonb END,
    CASE WHEN ROUND(v_sgst, 2) > 0 THEN
      jsonb_build_object('account_code', '2102', 'debit', 0, 'credit', ROUND(v_sgst, 2))
    ELSE NULL::jsonb END
  ) - ARRAY(SELECT NULL);

  v_branch_id := v_order.branch_id;

  v_ledger_entry_id := public.create_balanced_ledger_entry(
    'invoice',
    v_invoice_id,
    COALESCE(v_order.created_at::date, CURRENT_DATE),
    v_branch_id,
    'Invoice ' || v_invoice_number,
    v_ledger_lines
  );

  UPDATE public.orders
  SET invoice_id = v_invoice_id
  WHERE id = p_order_id;

  RETURN v_invoice_id;
END;
$$;
