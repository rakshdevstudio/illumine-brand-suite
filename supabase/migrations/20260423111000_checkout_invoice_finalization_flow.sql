-- Checkout invoice finalization flow fix
--
-- Purpose:
-- - Prevent invoice creation during partial order assembly
-- - Keep invoice immutability guard intact
-- - Ensure invoice creation happens only after all order_items are inserted
--
-- Safe to run multiple times.

CREATE OR REPLACE FUNCTION public.attach_checkout_entities_to_order(
  p_order_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_student_name text,
  p_school_id uuid,
  p_class_name text,
  p_gender text,
  p_alternate_phone text DEFAULT NULL
)
RETURNS TABLE(out_customer_id uuid, out_student_id uuid, out_invoice_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := regexp_replace(COALESCE(p_customer_phone, ''), '\\D', '', 'g');
  v_gender text;
  v_customer_id uuid;
  v_student_id uuid;
  v_class_id uuid;
  v_class_name text;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order id is required';
  END IF;

  IF v_phone = '' THEN
    RAISE EXCEPTION 'Customer phone is required';
  END IF;

  IF COALESCE(btrim(p_student_name), '') = '' THEN
    RAISE EXCEPTION 'Student name is required';
  END IF;

  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'School id is required';
  END IF;

  SELECT c.id
  INTO v_customer_id
  FROM public.customers AS c
  WHERE regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = v_phone
  ORDER BY c.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone, email)
    VALUES (
      NULLIF(btrim(p_customer_name), ''),
      v_phone,
      NULLIF(btrim(p_customer_email), '')
    )
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers AS c
    SET
      name = COALESCE(NULLIF(btrim(p_customer_name), ''), c.name),
      email = COALESCE(NULLIF(btrim(p_customer_email), ''), c.email)
    WHERE c.id = v_customer_id;
  END IF;

  SELECT c.id, c.name
  INTO v_class_id, v_class_name
  FROM public.classes AS c
  WHERE c.school_id = p_school_id
    AND lower(c.name) = lower(COALESCE(btrim(p_class_name), ''))
  ORDER BY c.sort_order ASC
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Class "%" not found for selected school', p_class_name;
  END IF;

  v_gender :=
    CASE lower(COALESCE(p_gender, ''))
      WHEN 'male' THEN 'Male'
      WHEN 'boy' THEN 'Male'
      WHEN 'boys' THEN 'Male'
      WHEN 'female' THEN 'Female'
      WHEN 'girl' THEN 'Female'
      WHEN 'girls' THEN 'Female'
      ELSE 'Unisex'
    END;

  INSERT INTO public.students (customer_id, name, school_id, class_id, gender)
  VALUES (
    v_customer_id,
    btrim(p_student_name),
    p_school_id,
    v_class_id,
    v_gender
  )
  ON CONFLICT (customer_id, name_normalized, school_id, class_id, gender)
  DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_student_id;

  UPDATE public.orders AS o
  SET
    customer_id = v_customer_id,
    student_id = v_student_id,
    customer_name = COALESCE(NULLIF(btrim(p_customer_name), ''), o.customer_name),
    phone = COALESCE(NULLIF(v_phone, ''), o.phone),
    student_name = COALESCE(NULLIF(btrim(p_student_name), ''), o.student_name),
    grade = COALESCE(v_class_name, o.grade),
    student_class = COALESCE(v_class_name, o.student_class),
    alternate_phone = COALESCE(NULLIF(btrim(p_alternate_phone), ''), o.alternate_phone)
  WHERE o.id = p_order_id;

  RETURN QUERY SELECT v_customer_id, v_student_id, NULL::uuid;
END;
$$;

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

  SELECT id
  INTO v_existing_invoice_id
  FROM public.invoices
  WHERE order_id = p_order_id
  LIMIT 1;

  IF v_existing_invoice_id IS NOT NULL THEN
    RETURN v_existing_invoice_id;
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
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Cannot create invoice for order % without items', p_order_id;
  END IF;

  IF abs(v_total - COALESCE(v_order.total_amount, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Invoice total mismatch: calc=%, order=%', v_total, v_order.total_amount;
  END IF;

  v_invoice_number := public.next_invoice_number(COALESCE(v_order.created_at, now()));
  v_address := concat_ws(', ', NULLIF(v_order.address, ''), NULLIF(v_order.city, ''), NULLIF(v_order.pincode, ''));

  INSERT INTO public.invoices (
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
    jsonb_build_object('account_code', '1200', 'debit', ROUND(v_total, 2), 'credit', 0),
    jsonb_build_object('account_code', '3100', 'debit', 0, 'credit', ROUND(v_subtotal, 2)),
    CASE WHEN ROUND(v_cgst, 2) > 0 THEN
      jsonb_build_object('account_code', '2101', 'debit', 0, 'credit', ROUND(v_cgst, 2))
    ELSE NULL::jsonb END,
    CASE WHEN ROUND(v_sgst, 2) > 0 THEN
      jsonb_build_object('account_code', '2102', 'debit', 0, 'credit', ROUND(v_sgst, 2))
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
