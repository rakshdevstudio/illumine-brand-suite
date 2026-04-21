-- Production-grade GST pricing engine supporting both inclusive and exclusive pricing.
-- This migration centralizes tax math in DB functions, snapshots pricing mode on transaction lines,
-- enforces order/invoice invariants, and keeps ledger postings balanced.

-- 1) Shared pricing helpers
CREATE OR REPLACE FUNCTION public.normalize_pricing_type(p_pricing_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(btrim(COALESCE(p_pricing_type, ''))) = 'exclusive' THEN 'exclusive'
    ELSE 'inclusive'
  END;
$$;

CREATE OR REPLACE FUNCTION public.compute_gst_line_values(
  p_quantity integer,
  p_unit_price numeric,
  p_gst_rate numeric,
  p_pricing_type text DEFAULT 'inclusive',
  p_is_interstate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_qty numeric(14,2);
  v_unit_price numeric(14,2);
  v_rate numeric(8,4);
  v_pricing_type text;
  v_taxable numeric(14,2);
  v_tax numeric(14,2);
  v_total numeric(14,2);
  v_cgst numeric(14,2) := 0;
  v_sgst numeric(14,2) := 0;
  v_igst numeric(14,2) := 0;
BEGIN
  v_qty := ROUND(COALESCE(p_quantity, 0)::numeric, 2);
  v_unit_price := ROUND(COALESCE(p_unit_price, 0)::numeric, 2);
  v_rate := ROUND(GREATEST(COALESCE(p_gst_rate, 0)::numeric, 0), 4);
  v_pricing_type := public.normalize_pricing_type(p_pricing_type);

  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be > 0';
  END IF;

  IF v_unit_price < 0 THEN
    RAISE EXCEPTION 'Unit price cannot be negative';
  END IF;

  IF v_pricing_type = 'inclusive' THEN
    v_total := ROUND(v_qty * v_unit_price, 2);

    IF v_rate = 0 THEN
      v_taxable := v_total;
      v_tax := 0;
    ELSE
      v_taxable := ROUND(v_total / (1 + (v_rate / 100.0)), 2);
      v_tax := ROUND(v_total - v_taxable, 2);
    END IF;
  ELSE
    v_taxable := ROUND(v_qty * v_unit_price, 2);
    v_tax := ROUND(v_taxable * v_rate / 100.0, 2);
    v_total := ROUND(v_taxable + v_tax, 2);
  END IF;

  IF v_total < 0 OR v_taxable < 0 OR v_tax < 0 THEN
    RAISE EXCEPTION 'Computed amounts cannot be negative';
  END IF;

  IF p_is_interstate THEN
    v_igst := v_tax;
  ELSE
    v_cgst := ROUND(v_tax / 2.0, 2);
    v_sgst := ROUND(v_tax - v_cgst, 2);
  END IF;

  RETURN jsonb_build_object(
    'pricing_type', v_pricing_type,
    'quantity', v_qty,
    'unit_price', v_unit_price,
    'gst_rate', ROUND(v_rate, 2),
    'taxable', ROUND(v_taxable, 2),
    'tax', ROUND(v_tax, 2),
    'cgst', ROUND(v_cgst, 2),
    'sgst', ROUND(v_sgst, 2),
    'igst', ROUND(v_igst, 2),
    'total', ROUND(v_total, 2)
  );
END;
$$;

-- 2) Pricing type columns + backfill strategy
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS pricing_type text;

UPDATE public.product_variants
SET pricing_type = COALESCE(pricing_type, 'inclusive');

ALTER TABLE public.product_variants
  ALTER COLUMN pricing_type SET DEFAULT 'inclusive';

ALTER TABLE public.product_variants
  ALTER COLUMN pricing_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_variants_pricing_type_check'
      AND conrelid = 'public.product_variants'::regclass
  ) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_pricing_type_check
      CHECK (pricing_type IN ('inclusive', 'exclusive'));
  END IF;
END
$$;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS pricing_type text;

-- Existing transactional rows are backfilled as exclusive for compatibility.
UPDATE public.invoice_items
SET pricing_type = 'exclusive'
WHERE pricing_type IS NULL;

ALTER TABLE public.invoice_items
  ALTER COLUMN pricing_type SET DEFAULT 'inclusive';

ALTER TABLE public.invoice_items
  ALTER COLUMN pricing_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_items_pricing_type_check'
      AND conrelid = 'public.invoice_items'::regclass
  ) THEN
    ALTER TABLE public.invoice_items
      ADD CONSTRAINT invoice_items_pricing_type_check
      CHECK (pricing_type IN ('inclusive', 'exclusive'));
  END IF;
END
$$;

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS pricing_type text;

-- Existing transactional rows are backfilled as exclusive for compatibility.
UPDATE public.purchase_items
SET pricing_type = 'exclusive'
WHERE pricing_type IS NULL;

ALTER TABLE public.purchase_items
  ALTER COLUMN pricing_type SET DEFAULT 'inclusive';

ALTER TABLE public.purchase_items
  ALTER COLUMN pricing_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_items_pricing_type_check'
      AND conrelid = 'public.purchase_items'::regclass
  ) THEN
    ALTER TABLE public.purchase_items
      ADD CONSTRAINT purchase_items_pricing_type_check
      CHECK (pricing_type IN ('inclusive', 'exclusive'));
  END IF;
END
$$;

-- 3) Canonical DB order total recomputation (do not trust frontend totals)
CREATE OR REPLACE FUNCTION public.recompute_order_total_from_items(p_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(14,2) := 0;
BEGIN
  SELECT ROUND(COALESCE(SUM((line_calc->>'total')::numeric), 0), 2)
  INTO v_total
  FROM (
    SELECT public.compute_gst_line_values(
      COALESCE(oi.quantity, 0),
      COALESCE(oi.price, 0),
      COALESCE(p.gst_percentage, 0),
      COALESCE(pv.pricing_type, 'inclusive'),
      false
    ) AS line_calc
    FROM public.order_items oi
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  ) t;

  UPDATE public.orders
  SET total_amount = v_total,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_order_total_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_order_total_from_items(OLD.order_id);
  ELSE
    PERFORM public.recompute_order_total_from_items(NEW.order_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_order_total_from_items ON public.order_items;
CREATE TRIGGER trg_recompute_order_total_from_items
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_order_total_from_items();

-- 4) Invoice creation snapshot updated for pricing mode
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

-- 5) Fully corrected invoice posting + ledger
CREATE OR REPLACE FUNCTION public.create_invoice_with_ledger(
  p_order_id uuid,
  p_customer_state_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_invoice record;
  v_customer record;
  v_branch record;
  v_item record;
  v_ledger_id uuid;
  v_seller_state text;
  v_customer_state text;
  v_is_interstate boolean;
  v_before jsonb;
  v_after jsonb;
  v_lines jsonb;
  v_calc jsonb;
  v_paid numeric(12,2);
  v_balance numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_cgst numeric(12,2) := 0;
  v_sgst numeric(12,2) := 0;
  v_igst numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_order_total numeric(12,2) := 0;
BEGIN
  PERFORM public.assert_finance_admin();

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  SELECT i.*
  INTO v_invoice
  FROM public.invoices i
  WHERE i.order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice for order % not found', p_order_id;
  END IF;

  SELECT b.id, public.normalize_state_code(b.state_code) AS state_code
  INTO v_branch
  FROM public.branches b
  WHERE b.id = v_order.branch_id;

  SELECT c.id, public.normalize_state_code(c.state_code) AS state_code
  INTO v_customer
  FROM public.customers c
  WHERE c.id = v_order.customer_id;

  v_seller_state := COALESCE(v_branch.state_code, public.normalize_state_code(v_invoice.seller_state_code));
  v_customer_state := COALESCE(public.normalize_state_code(p_customer_state_code), v_customer.state_code, public.normalize_state_code(v_order.customer_state_code), public.normalize_state_code(v_invoice.customer_state_code));

  IF v_seller_state IS NULL OR v_customer_state IS NULL THEN
    RAISE EXCEPTION 'Cannot determine GST regime. Missing seller/customer state code';
  END IF;

  v_is_interstate := (v_seller_state <> v_customer_state);

  v_before := jsonb_build_object(
    'subtotal', v_invoice.subtotal,
    'cgst', v_invoice.cgst,
    'sgst', v_invoice.sgst,
    'igst', v_invoice.igst,
    'total', v_invoice.total,
    'paid_amount', COALESCE(v_invoice.paid_amount, 0),
    'balance_amount', COALESCE(v_invoice.balance_amount, v_invoice.total),
    'status', v_invoice.status
  );

  FOR v_item IN
    SELECT
      ii.id,
      ii.quantity,
      ii.unit_price,
      ii.gst_percentage,
      ii.pricing_type
    FROM public.invoice_items ii
    WHERE ii.invoice_id = v_invoice.id
    FOR UPDATE
  LOOP
    v_calc := public.compute_gst_line_values(
      v_item.quantity,
      v_item.unit_price,
      COALESCE(v_item.gst_percentage, 0),
      COALESCE(v_item.pricing_type, 'inclusive'),
      v_is_interstate
    );

    UPDATE public.invoice_items
    SET
      pricing_type = public.normalize_pricing_type(v_item.pricing_type),
      taxable_value = (v_calc->>'taxable')::numeric,
      cgst_amount = (v_calc->>'cgst')::numeric,
      sgst_amount = (v_calc->>'sgst')::numeric,
      igst_amount = (v_calc->>'igst')::numeric,
      total = (v_calc->>'total')::numeric
    WHERE id = v_item.id;

    v_subtotal := v_subtotal + (v_calc->>'taxable')::numeric;
    v_cgst := v_cgst + (v_calc->>'cgst')::numeric;
    v_sgst := v_sgst + (v_calc->>'sgst')::numeric;
    v_igst := v_igst + (v_calc->>'igst')::numeric;
    v_total := v_total + (v_calc->>'total')::numeric;
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);
  v_cgst := ROUND(v_cgst, 2);
  v_sgst := ROUND(v_sgst, 2);
  v_igst := ROUND(v_igst, 2);
  v_total := ROUND(v_total, 2);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Invoice total must be > 0';
  END IF;

  v_order_total := public.recompute_order_total_from_items(v_order.id);

  IF ROUND(v_order_total, 2) <> v_total THEN
    RAISE EXCEPTION 'Order total and invoice total mismatch. order_total=%, invoice_total=%', ROUND(v_order_total, 2), v_total;
  END IF;

  v_paid := ROUND(COALESCE(v_invoice.paid_amount, 0), 2);
  v_balance := ROUND(v_total - v_paid, 2);

  IF v_balance < 0 THEN
    RAISE EXCEPTION 'Invoice paid amount exceeds total. paid=%, total=%', v_paid, v_total;
  END IF;

  UPDATE public.orders
  SET total_amount = v_total,
      customer_state_code = COALESCE(v_order.customer_state_code, v_customer_state),
      updated_at = now()
  WHERE id = v_order.id;

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    cgst = v_cgst,
    sgst = v_sgst,
    igst = v_igst,
    total = v_total,
    is_interstate = v_is_interstate,
    seller_state_code = v_seller_state,
    customer_state_code = v_customer_state,
    paid_amount = v_paid,
    balance_amount = v_balance,
    status = CASE
      WHEN status = 'cancelled' THEN 'cancelled'
      WHEN v_balance <= 0 THEN 'paid'
      WHEN v_paid > 0 THEN 'partially_paid'
      ELSE 'issued'
    END
  WHERE id = v_invoice.id;

  SELECT le.id
  INTO v_ledger_id
  FROM public.ledger_entries le
  WHERE le.reference_type = 'invoice'
    AND le.reference_id = v_invoice.id
  LIMIT 1;

  IF v_ledger_id IS NULL THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '1200', 'debit', v_total, 'credit', 0),
      jsonb_build_object('account_code', '3100', 'debit', 0, 'credit', v_subtotal)
    );

    IF v_cgst > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', '2101', 'debit', 0, 'credit', v_cgst));
    END IF;

    IF v_sgst > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', '2102', 'debit', 0, 'credit', v_sgst));
    END IF;

    IF v_igst > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', '2103', 'debit', 0, 'credit', v_igst));
    END IF;

    v_ledger_id := public.create_balanced_ledger_entry(
      'invoice',
      v_invoice.id,
      CURRENT_DATE,
      v_order.branch_id,
      'Invoice posting',
      v_lines
    );
  END IF;

  SELECT jsonb_build_object(
    'subtotal', i.subtotal,
    'cgst', i.cgst,
    'sgst', i.sgst,
    'igst', i.igst,
    'total', i.total,
    'paid_amount', i.paid_amount,
    'balance_amount', i.balance_amount,
    'status', i.status
  ) INTO v_after
  FROM public.invoices i
  WHERE i.id = v_invoice.id;

  PERFORM public.log_financial_action(
    'create_invoice_with_ledger',
    'invoice',
    v_invoice.id,
    jsonb_build_object('ledger_entry_id', v_ledger_id, 'order_id', v_order.id),
    NULL,
    'rpc',
    v_before,
    v_after
  );

  RETURN jsonb_build_object(
    'invoice_id', v_invoice.id,
    'order_id', v_order.id,
    'ledger_entry_id', v_ledger_id,
    'subtotal', v_subtotal,
    'cgst', v_cgst,
    'sgst', v_sgst,
    'igst', v_igst,
    'total', v_total,
    'paid_amount', v_paid,
    'balance_amount', v_balance,
    'is_interstate', v_is_interstate
  );
END;
$$;

-- 6) Fully corrected purchase posting + ledger
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
  v_calc jsonb;
  v_subtotal numeric(12,2) := 0;
  v_cgst numeric(12,2) := 0;
  v_sgst numeric(12,2) := 0;
  v_igst numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_payload_total numeric(12,2);
  v_branch_id uuid;
  v_vendor_id uuid;
  v_seller_state text;
  v_vendor_state text;
  v_is_interstate boolean;
  v_ledger_id uuid;
  v_inventory_account text := COALESCE(NULLIF(p_payload->>'inventory_account_code', ''), '1000');
  v_payable_account text := COALESCE(NULLIF(p_payload->>'payable_account_code', ''), '2200');
  v_default_pricing_type text := public.normalize_pricing_type(p_payload->>'pricing_type');
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
    is_interstate,
    paid_amount,
    balance_amount
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
    v_is_interstate,
    0,
    0
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

    v_calc := public.compute_gst_line_values(
      (v_item->>'quantity')::integer,
      COALESCE((v_item->>'unit_cost')::numeric, 0),
      COALESCE((v_item->>'gst_percentage')::numeric, 0),
      COALESCE(v_item->>'pricing_type', v_default_pricing_type),
      v_is_interstate
    );

    INSERT INTO public.purchase_items (
      purchase_id,
      product_id,
      variant_id,
      quantity,
      unit_cost,
      gst_percentage,
      pricing_type,
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
      ROUND(COALESCE((v_item->>'unit_cost')::numeric, 0), 2),
      ROUND(COALESCE((v_item->>'gst_percentage')::numeric, 0), 2),
      public.normalize_pricing_type(COALESCE(v_item->>'pricing_type', v_default_pricing_type)),
      (v_calc->>'cgst')::numeric,
      (v_calc->>'sgst')::numeric,
      (v_calc->>'igst')::numeric,
      (v_calc->>'total')::numeric
    );

    v_subtotal := v_subtotal + (v_calc->>'taxable')::numeric;
    v_cgst := v_cgst + (v_calc->>'cgst')::numeric;
    v_sgst := v_sgst + (v_calc->>'sgst')::numeric;
    v_igst := v_igst + (v_calc->>'igst')::numeric;
    v_total := v_total + (v_calc->>'total')::numeric;

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

  IF v_subtotal < 0 OR v_total <= 0 THEN
    RAISE EXCEPTION 'Purchase totals must be positive';
  END IF;

  v_payload_total := NULLIF(p_payload->>'total', '')::numeric;
  IF v_payload_total IS NOT NULL AND ROUND(v_payload_total, 2) <> v_total THEN
    RAISE EXCEPTION 'Payload total mismatch. expected=%, computed=%', ROUND(v_payload_total, 2), v_total;
  END IF;

  UPDATE public.purchases
  SET
    subtotal = v_subtotal,
    cgst = v_cgst,
    sgst = v_sgst,
    igst = v_igst,
    total = v_total,
    status = 'received',
    balance_amount = v_total,
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

-- 7) Hard invariant trigger: order total must match invoice total
CREATE OR REPLACE FUNCTION public.enforce_order_invoice_total_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_total numeric(12,2);
BEGIN
  SELECT ROUND(COALESCE(o.total_amount, 0), 2)
  INTO v_order_total
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF ROUND(COALESCE(NEW.total, 0), 2) <> v_order_total THEN
    RAISE EXCEPTION 'Invoice total must match order total. invoice_total=%, order_total=%', ROUND(COALESCE(NEW.total, 0), 2), v_order_total;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_invoice_total_match ON public.invoices;
CREATE TRIGGER trg_enforce_order_invoice_total_match
BEFORE INSERT OR UPDATE OF total, order_id ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_invoice_total_match();

GRANT EXECUTE ON FUNCTION public.normalize_pricing_type(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_gst_line_values(integer, numeric, numeric, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_order_total_from_items(uuid) TO authenticated;
