-- Fix storefront checkout failure caused by invoice guard trigger.
--
-- Root cause:
-- create_invoice_from_order inserts an invoice and then updates it to final totals.
-- The newer guard trigger blocks direct invoice updates unless app.bypass_invoice_guard is enabled.
--
-- This migration keeps guard protections in place while allowing this trusted SECURITY DEFINER
-- function to perform its own internal update.

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
  v_address text;
  v_item record;
  v_calc jsonb;
  v_subtotal numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_order_total numeric(12,2) := 0;
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

  SELECT id
  INTO v_existing_invoice_id
  FROM public.invoices
  WHERE order_id = p_order_id
  LIMIT 1;

  IF v_existing_invoice_id IS NOT NULL THEN
    UPDATE public.orders
    SET invoice_id = COALESCE(invoice_id, v_existing_invoice_id)
    WHERE id = p_order_id;

    RETURN v_existing_invoice_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  ) THEN
    RAISE EXCEPTION 'Cannot create invoice for order % without items', p_order_id;
  END IF;

  v_order_total := public.recompute_order_total_from_items(p_order_id);
  v_invoice_number := public.next_invoice_number(COALESCE(v_order.created_at, now()));
  v_address := concat_ws(', ', NULLIF(v_order.address, ''), NULLIF(v_order.city, ''), NULLIF(v_order.pincode, ''));

  INSERT INTO public.invoices (
    order_id,
    customer_id,
    student_id,
    invoice_number,
    customer_name,
    phone,
    address,
    subtotal,
    cgst,
    sgst,
    igst,
    total,
    paid_amount,
    balance_amount,
    created_at,
    status
  )
  VALUES (
    p_order_id,
    v_order.customer_id,
    v_order.student_id,
    v_invoice_number,
    COALESCE(v_order.customer_name, ''),
    COALESCE(v_order.phone, ''),
    COALESCE(NULLIF(v_address, ''), COALESCE(v_order.address, '')),
    0,
    ROUND(v_order_total / 2.0, 2),
    ROUND(v_order_total - ROUND(v_order_total / 2.0, 2), 2),
    0,
    v_order_total,
    0,
    v_order_total,
    COALESCE(v_order.created_at, now()),
    'issued'
  )
  RETURNING id INTO v_invoice_id;

  -- Enable guard bypass for the full invoice materialization flow,
  -- including nested trigger-driven invoice updates from invoice_items inserts.
  PERFORM set_config('app.bypass_invoice_guard', 'on', true);

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
      v_item.quantity,
      v_item.price,
      v_item.gst_percentage,
      v_item.pricing_type,
      false
    );

    INSERT INTO public.invoice_items (
      invoice_id,
      product_id,
      variant_id,
      quantity,
      unit_price,
      gst_percentage,
      pricing_type,
      taxable_value,
      cgst_amount,
      sgst_amount,
      igst_amount,
      total
    )
    VALUES (
      v_invoice_id,
      v_item.product_id,
      v_item.variant_id,
      v_item.quantity,
      ROUND(COALESCE(v_item.price, 0), 2),
      ROUND(COALESCE(v_item.gst_percentage, 0), 2),
      public.normalize_pricing_type(v_item.pricing_type),
      (v_calc->>'taxable')::numeric,
      (v_calc->>'cgst')::numeric,
      (v_calc->>'sgst')::numeric,
      (v_calc->>'igst')::numeric,
      (v_calc->>'total')::numeric
    );

    v_subtotal := v_subtotal + (v_calc->>'taxable')::numeric;
    v_tax_total := v_tax_total + (v_calc->>'tax')::numeric;
    v_total := v_total + (v_calc->>'total')::numeric;
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);
  v_tax_total := ROUND(v_tax_total, 2);
  v_total := ROUND(v_total, 2);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Invoice total must be > 0';
  END IF;

  IF ROUND(v_order_total, 2) <> v_total THEN
    RAISE EXCEPTION 'Order total mismatch while creating invoice. order_total=%, invoice_total=%', ROUND(v_order_total, 2), v_total;
  END IF;

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    cgst = ROUND(v_tax_total / 2.0, 2),
    sgst = ROUND(v_tax_total - ROUND(v_tax_total / 2.0, 2), 2),
    igst = 0,
    total = v_total,
    paid_amount = 0,
    balance_amount = v_total
  WHERE id = v_invoice_id;

  UPDATE public.orders
  SET invoice_id = v_invoice_id,
      total_amount = v_total,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_invoice_id;
END;
$$;
