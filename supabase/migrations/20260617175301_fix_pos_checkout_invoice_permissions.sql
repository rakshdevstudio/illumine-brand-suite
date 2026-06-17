-- 1. Modify create_balanced_ledger_entry to support bypass_ledger_guard
CREATE OR REPLACE FUNCTION public.create_balanced_ledger_entry(
  p_reference_type text,
  p_reference_id uuid,
  p_entry_date date,
  p_branch_id uuid,
  p_description text,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_entry_no text;
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric(14,2) := 0;
  v_credit numeric(14,2) := 0;
  v_line_debit numeric(14,2);
  v_line_credit numeric(14,2);
  v_source_type public.ledger_source_type := 'adjustment'::public.ledger_source_type;
BEGIN
  -- Only assert finance admin if bypass is not explicitly enabled by an authorized upstream RPC
  IF current_setting('app.bypass_ledger_guard', true) IS DISTINCT FROM 'on' THEN
    PERFORM public.assert_finance_admin();
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Ledger lines must contain at least two rows';
  END IF;

  v_source_type := CASE lower(COALESCE(p_reference_type, ''))
    WHEN 'invoice' THEN 'invoice'::public.ledger_source_type
    WHEN 'purchase' THEN 'purchase'::public.ledger_source_type
    WHEN 'payment' THEN 'payment'::public.ledger_source_type
    WHEN 'expense' THEN 'expense'::public.ledger_source_type
    ELSE 'adjustment'::public.ledger_source_type
  END;

  v_entry_no := public.next_ledger_entry_number(COALESCE(p_entry_date, CURRENT_DATE));

  INSERT INTO public.ledger_entries (
    entry_number,
    entry_date,
    source_type,
    source_id,
    branch_id,
    narration,
    created_by,
    reference_type,
    reference_id,
    description,
    txn_date
  )
  VALUES (
    v_entry_no,
    COALESCE(p_entry_date, CURRENT_DATE),
    v_source_type,
    p_reference_id,
    p_branch_id,
    p_description,
    auth.uid(),
    lower(COALESCE(p_reference_type, 'adjustment')),
    p_reference_id,
    p_description,
    COALESCE(p_entry_date, CURRENT_DATE)
  )
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT a.id
    INTO v_account_id
    FROM public.accounts a
    WHERE a.code = btrim(v_line->>'account_code')
      AND a.is_active = true
    LIMIT 1;

    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Unknown/inactive account code: %', v_line->>'account_code';
    END IF;

    v_line_debit := ROUND(COALESCE((v_line->>'debit')::numeric, 0), 2);
    v_line_credit := ROUND(COALESCE((v_line->>'credit')::numeric, 0), 2);

    IF (v_line_debit > 0 AND v_line_credit > 0) OR (v_line_debit <= 0 AND v_line_credit <= 0) THEN
      RAISE EXCEPTION 'Exactly one of debit/credit must be positive for account %', v_line->>'account_code';
    END IF;

    INSERT INTO public.ledger_entry_lines (
      ledger_entry_id,
      account_id,
      side,
      amount,
      debit,
      credit
    )
    VALUES (
      v_entry_id,
      v_account_id,
      CASE WHEN v_line_debit > 0 THEN 'debit'::public.voucher_side ELSE 'credit'::public.voucher_side END,
      CASE WHEN v_line_debit > 0 THEN v_line_debit ELSE v_line_credit END,
      CASE WHEN v_line_debit > 0 THEN v_line_debit ELSE 0 END,
      CASE WHEN v_line_credit > 0 THEN v_line_credit ELSE 0 END
    );

    v_debit := v_debit + CASE WHEN v_line_debit > 0 THEN v_line_debit ELSE 0 END;
    v_credit := v_credit + CASE WHEN v_line_credit > 0 THEN v_line_credit ELSE 0 END;
  END LOOP;

  IF ROUND(v_debit, 2) <> ROUND(v_credit, 2) THEN
    RAISE EXCEPTION 'Unbalanced ledger entry. debit=%, credit=%', ROUND(v_debit, 2), ROUND(v_credit, 2);
  END IF;

  PERFORM public.log_financial_action(
    'create_balanced_ledger_entry',
    'ledger_entry',
    v_entry_id,
    jsonb_build_object('reference_type', p_reference_type, 'reference_id', p_reference_id)
  );

  RETURN v_entry_id;
END;
$$;

-- 2. Modify create_invoice_from_order to enforce role and branch ownership check, and bypass ledger guard
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
  
  -- Auth variables
  v_current_role text;
  v_is_authorized boolean := false;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Authorization Check
  IF auth.uid() IS NULL THEN
    v_is_authorized := true; -- Anon storefront checkout
  ELSIF auth.uid() = v_order.customer_id THEN
    v_is_authorized := true; -- Authenticated customer checkout
  ELSE
    SELECT role INTO v_current_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    
    IF v_current_role IN ('admin', 'super_admin') THEN
      v_is_authorized := true;
    ELSIF v_current_role IN ('school_admin', 'cashier', 'pos_operator') THEN
      -- Validate ownership using branch_id / store
      IF EXISTS (
        SELECT 1 FROM public.staff_branches 
        WHERE user_id = auth.uid() AND branch_id = v_order.branch_id
      ) THEN
        v_is_authorized := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized invoice creation' USING ERRCODE = '42501';
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

  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'No items for order %', p_order_id;
  END IF;

  v_total := ROUND(COALESCE(v_authoritative_total, 0), 2);

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

  -- Bypassing ledger guard temporarily so create_invoice_from_order can post ledgers
  PERFORM set_config('app.bypass_ledger_guard', 'on', true);

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

GRANT EXECUTE ON FUNCTION public.create_invoice_from_order TO authenticated, anon;
