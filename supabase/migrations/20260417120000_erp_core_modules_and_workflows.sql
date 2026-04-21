-- Illume ERP core modules: purchase, accounting, GST reporting, and transactional APIs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_source_type') THEN
    CREATE TYPE public.ledger_source_type AS ENUM ('invoice', 'purchase', 'expense', 'payment', 'adjustment');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'voucher_side') THEN
    CREATE TYPE public.voucher_side AS ENUM ('debit', 'credit');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_status') THEN
    CREATE TYPE public.purchase_status AS ENUM ('draft', 'confirmed', 'received', 'cancelled');
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.is_backoffice_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'admin', 'staff', 'branch_staff')
  );
$$;

CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  gstin text,
  address text,
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  status public.purchase_status NOT NULL DEFAULT 'draft',
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  cgst numeric(12,2) NOT NULL DEFAULT 0,
  sgst numeric(12,2) NOT NULL DEFAULT 0,
  igst numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchases_purchase_number_unique UNIQUE (purchase_number)
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(12,2) NOT NULL CHECK (unit_cost >= 0),
  gst_percentage numeric(6,2) NOT NULL DEFAULT 5 CHECK (gst_percentage >= 0),
  cgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  igst_amount numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  type public.account_type NOT NULL,
  parent_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_code_unique UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  source_type public.ledger_source_type NOT NULL,
  source_id uuid,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  narration text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_entry_number_unique UNIQUE (entry_number)
);

CREATE TABLE IF NOT EXISTS public.ledger_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id uuid NOT NULL REFERENCES public.ledger_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  side public.voucher_side NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  mode text,
  reference_no text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  hsn_code text,
  gst_rate numeric(6,2) NOT NULL CHECK (gst_rate >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_unique_idx
  ON public.vendors (lower(name));

CREATE INDEX IF NOT EXISTS vendors_search_idx
  ON public.vendors USING gin ((coalesce(name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(gstin, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS purchases_vendor_date_idx
  ON public.purchases (vendor_id, purchase_date DESC);

CREATE INDEX IF NOT EXISTS purchases_status_date_idx
  ON public.purchases (status, purchase_date DESC);

CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx
  ON public.purchase_items (purchase_id);

CREATE INDEX IF NOT EXISTS ledger_entries_source_idx
  ON public.ledger_entries (source_type, source_id);

CREATE INDEX IF NOT EXISTS ledger_entry_lines_ledger_idx
  ON public.ledger_entry_lines (ledger_entry_id);

CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx
  ON public.invoice_payments (invoice_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS product_tax_rules_product_active_idx
  ON public.product_tax_rules (product_id, is_active, effective_from DESC);

CREATE INDEX IF NOT EXISTS customers_phone_lookup_idx
  ON public.customers ((regexp_replace(coalesce(phone, ''), '\\D', '', 'g')));

CREATE INDEX IF NOT EXISTS customers_name_search_idx
  ON public.customers USING gin (coalesce(name, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS students_name_search_idx
  ON public.students USING gin (coalesce(name, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS invoices_invoice_number_idx
  ON public.invoices (invoice_number);

CREATE INDEX IF NOT EXISTS orders_created_status_idx
  ON public.orders (created_at DESC, status);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tax_rules ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vendors',
    'purchases',
    'purchase_items',
    'accounts',
    'ledger_entries',
    'ledger_entry_lines',
    'invoice_payments',
    'product_tax_rules'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'backoffice_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'backoffice_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'backoffice_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'backoffice_delete_' || t, t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_backoffice_user())',
      'backoffice_select_' || t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_backoffice_user())',
      'backoffice_insert_' || t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_backoffice_user()) WITH CHECK (public.is_backoffice_user())',
      'backoffice_update_' || t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_backoffice_user())',
      'backoffice_delete_' || t,
      t
    );
  END LOOP;
END
$$;

INSERT INTO public.accounts (code, name, type, is_system)
VALUES
  ('1000', 'Inventory Asset', 'asset', true),
  ('1100', 'Cash & Bank', 'asset', true),
  ('1200', 'Accounts Receivable', 'asset', true),
  ('1210', 'Input CGST', 'asset', true),
  ('1211', 'Input SGST', 'asset', true),
  ('2100', 'Output GST Payable', 'liability', true),
  ('2200', 'Accounts Payable', 'liability', true),
  ('3100', 'Sales Revenue', 'income', true),
  ('4100', 'Purchase Expense', 'expense', true),
  ('5100', 'Operating Expense', 'expense', true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  is_system = true;

CREATE OR REPLACE FUNCTION public.next_purchase_number(p_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year text := to_char(p_date, 'YYYY');
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('illume-purchase-number-' || v_year));

  SELECT COALESCE(MAX(split_part(purchase_number, '-', 3)::integer), 0) + 1
  INTO v_next
  FROM public.purchases
  WHERE purchase_number LIKE 'PUR-' || v_year || '-%'
    AND purchase_number ~ ('^PUR-' || v_year || '-[0-9]+$');

  RETURN 'PUR-' || v_year || '-' || lpad(v_next::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_ledger_entry_number(p_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year text := to_char(p_date, 'YYYY');
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('illume-ledger-entry-' || v_year));

  SELECT COALESCE(MAX(split_part(entry_number, '-', 3)::integer), 0) + 1
  INTO v_next
  FROM public.ledger_entries
  WHERE entry_number LIKE 'LE-' || v_year || '-%'
    AND entry_number ~ ('^LE-' || v_year || '-[0-9]+$');

  RETURN 'LE-' || v_year || '-' || lpad(v_next::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_ledger_entry(
  p_source_type public.ledger_source_type,
  p_source_id uuid,
  p_entry_date date,
  p_branch_id uuid,
  p_narration text,
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
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Ledger lines must contain at least two rows';
  END IF;

  v_entry_no := public.next_ledger_entry_number(COALESCE(p_entry_date, CURRENT_DATE));

  INSERT INTO public.ledger_entries (
    entry_number,
    entry_date,
    source_type,
    source_id,
    branch_id,
    narration,
    created_by
  )
  VALUES (
    v_entry_no,
    COALESCE(p_entry_date, CURRENT_DATE),
    p_source_type,
    p_source_id,
    p_branch_id,
    p_narration,
    auth.uid()
  )
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT id
    INTO v_account_id
    FROM public.accounts
    WHERE code = (v_line->>'account_code')
      AND is_active = true
    LIMIT 1;

    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Unknown or inactive account code: %', v_line->>'account_code';
    END IF;

    IF lower(COALESCE(v_line->>'side', '')) NOT IN ('debit', 'credit') THEN
      RAISE EXCEPTION 'Invalid ledger side: %', v_line->>'side';
    END IF;

    IF COALESCE((v_line->>'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Ledger amount must be > 0';
    END IF;

    INSERT INTO public.ledger_entry_lines (ledger_entry_id, account_id, side, amount)
    VALUES (
      v_entry_id,
      v_account_id,
      lower(v_line->>'side')::public.voucher_side,
      round((v_line->>'amount')::numeric, 2)
    );

    IF lower(v_line->>'side') = 'debit' THEN
      v_debit := v_debit + round((v_line->>'amount')::numeric, 2);
    ELSE
      v_credit := v_credit + round((v_line->>'amount')::numeric, 2);
    END IF;
  END LOOP;

  IF round(v_debit, 2) <> round(v_credit, 2) THEN
    RAISE EXCEPTION 'Ledger not balanced. debit=%, credit=%', round(v_debit, 2), round(v_credit, 2);
  END IF;

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_ledger_for_invoice(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_order record;
  v_existing uuid;
BEGIN
  SELECT id
  INTO v_existing
  FROM public.ledger_entries
  WHERE source_type = 'invoice'
    AND source_id = p_invoice_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT i.id, i.subtotal, i.cgst, i.sgst, i.total, i.created_at, i.order_id
  INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  SELECT o.id, o.branch_id
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_invoice.order_id;

  RETURN public.create_ledger_entry(
    'invoice',
    p_invoice_id,
    v_invoice.created_at::date,
    v_order.branch_id,
    'Sales invoice posting',
    jsonb_build_array(
      jsonb_build_object('account_code', '1200', 'side', 'debit', 'amount', v_invoice.total),
      jsonb_build_object('account_code', '3100', 'side', 'credit', 'amount', v_invoice.subtotal),
      jsonb_build_object('account_code', '2100', 'side', 'credit', 'amount', v_invoice.cgst + v_invoice.sgst)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_customer_by_phone(p_phone text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.find_checkout_customer_by_phone(p_phone);
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory(
  p_branch_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_reason text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity cannot be zero';
  END IF;

  RETURN public.apply_inventory_movement(
    p_branch_id,
    p_variant_id,
    'ADJUSTMENT',
    p_quantity,
    'MANUAL',
    p_reference_id,
    p_reason,
    auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_total numeric(12,2) := 0;
  v_invoice_id uuid;
  v_branch_id uuid;
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

  INSERT INTO public.orders (
    customer_name,
    phone,
    address,
    school_id,
    branch_id,
    status,
    dispatch_status,
    total_amount
  )
  VALUES (
    btrim(p_payload->>'customer_name'),
    regexp_replace(COALESCE(p_payload->>'phone', ''), '\\D', '', 'g'),
    COALESCE(NULLIF(btrim(p_payload->>'address'), ''), '-'),
    NULLIF(p_payload->>'school_id', '')::uuid,
    v_branch_id,
    'pending',
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
      updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'total_amount', round(v_total, 2),
    'status', 'pending'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invoice(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_ledger_id uuid;
BEGIN
  v_invoice_id := public.create_invoice_from_order(p_order_id);

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice could not be created for order %', p_order_id;
  END IF;

  v_ledger_id := public.post_ledger_for_invoice(v_invoice_id);

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'ledger_entry_id', v_ledger_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_purchase(p_payload jsonb)
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
  v_line_gst numeric(12,2);
  v_branch_id uuid;
  v_ledger_id uuid;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid purchase payload';
  END IF;

  IF NULLIF(p_payload->>'vendor_id', '') IS NULL THEN
    RAISE EXCEPTION 'vendor_id is required';
  END IF;

  IF COALESCE(jsonb_typeof(p_payload->'items'), '') <> 'array' OR jsonb_array_length(p_payload->'items') = 0 THEN
    RAISE EXCEPTION 'items are required';
  END IF;

  v_branch_id := NULLIF(p_payload->>'branch_id', '')::uuid;
  v_purchase_no := public.next_purchase_number(COALESCE(NULLIF(p_payload->>'purchase_date', '')::date, CURRENT_DATE));

  INSERT INTO public.purchases (
    purchase_number,
    vendor_id,
    branch_id,
    status,
    purchase_date,
    due_date,
    notes,
    created_by
  )
  VALUES (
    v_purchase_no,
    (p_payload->>'vendor_id')::uuid,
    v_branch_id,
    COALESCE(NULLIF(p_payload->>'status', '')::public.purchase_status, 'received'::public.purchase_status),
    COALESCE(NULLIF(p_payload->>'purchase_date', '')::date, CURRENT_DATE),
    NULLIF(p_payload->>'due_date', '')::date,
    NULLIF(p_payload->>'notes', ''),
    auth.uid()
  )
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    IF COALESCE((v_item->>'quantity')::integer, 0) <= 0 THEN
      RAISE EXCEPTION 'Purchase item quantity must be > 0';
    END IF;

    v_line_base := round((v_item->>'quantity')::integer * (v_item->>'unit_cost')::numeric, 2);
    v_line_gst := round(v_line_base * COALESCE((v_item->>'gst_percentage')::numeric, 5) / 100.0, 2);

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
      round((v_item->>'unit_cost')::numeric, 2),
      round(COALESCE((v_item->>'gst_percentage')::numeric, 5), 2),
      round(v_line_gst / 2.0, 2),
      round(v_line_gst - (v_line_gst / 2.0), 2),
      0,
      round(v_line_base + v_line_gst, 2)
    );

    v_subtotal := v_subtotal + v_line_base;
    v_cgst := v_cgst + round(v_line_gst / 2.0, 2);
    v_sgst := v_sgst + round(v_line_gst - (v_line_gst / 2.0), 2);

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

  v_total := round(v_subtotal + v_cgst + v_sgst + v_igst, 2);

  UPDATE public.purchases
  SET
    subtotal = round(v_subtotal, 2),
    cgst = round(v_cgst, 2),
    sgst = round(v_sgst, 2),
    igst = round(v_igst, 2),
    total = v_total,
    status = 'received',
    updated_at = now()
  WHERE id = v_purchase_id;

  v_ledger_id := public.create_ledger_entry(
    'purchase',
    v_purchase_id,
    CURRENT_DATE,
    v_branch_id,
    'Purchase booking entry',
    jsonb_build_array(
      jsonb_build_object('account_code', '1000', 'side', 'debit', 'amount', v_subtotal),
      jsonb_build_object('account_code', '1210', 'side', 'debit', 'amount', v_cgst),
      jsonb_build_object('account_code', '1211', 'side', 'debit', 'amount', v_sgst),
      jsonb_build_object('account_code', '2200', 'side', 'credit', 'amount', v_total)
    )
  );

  RETURN jsonb_build_object(
    'purchase_id', v_purchase_id,
    'purchase_number', v_purchase_no,
    'ledger_entry_id', v_ledger_id,
    'total', v_total
  );
END;
$$;

CREATE OR REPLACE VIEW public.v_sales_gst_summary AS
SELECT
  date_trunc('day', i.created_at)::date AS report_date,
  count(*) AS invoice_count,
  round(sum(i.subtotal), 2) AS taxable_value,
  round(sum(i.cgst), 2) AS cgst_collected,
  round(sum(i.sgst), 2) AS sgst_collected,
  round(sum(i.total), 2) AS invoice_total
FROM public.invoices i
GROUP BY date_trunc('day', i.created_at)::date
ORDER BY report_date DESC;

CREATE OR REPLACE VIEW public.v_purchase_gst_summary AS
SELECT
  p.purchase_date AS report_date,
  count(*) AS purchase_count,
  round(sum(p.subtotal), 2) AS taxable_value,
  round(sum(p.cgst), 2) AS cgst_input,
  round(sum(p.sgst), 2) AS sgst_input,
  round(sum(p.total), 2) AS purchase_total
FROM public.purchases p
WHERE p.status IN ('confirmed', 'received')
GROUP BY p.purchase_date
ORDER BY report_date DESC;

CREATE OR REPLACE VIEW public.v_customer_outstanding AS
SELECT
  c.id AS customer_id,
  c.name,
  c.phone,
  count(i.id) AS invoice_count,
  round(coalesce(sum(i.total), 0), 2) AS billed_total,
  round(coalesce(sum(ip.amount), 0), 2) AS paid_total,
  round(coalesce(sum(i.total), 0) - coalesce(sum(ip.amount), 0), 2) AS outstanding_total,
  max(i.created_at) AS last_invoice_at
FROM public.customers c
LEFT JOIN public.invoices i ON i.customer_id = c.id
LEFT JOIN public.invoice_payments ip ON ip.invoice_id = i.id
GROUP BY c.id, c.name, c.phone
ORDER BY outstanding_total DESC, last_invoice_at DESC;

GRANT SELECT ON public.v_sales_gst_summary TO authenticated;
GRANT SELECT ON public.v_purchase_gst_summary TO authenticated;
GRANT SELECT ON public.v_customer_outstanding TO authenticated;

GRANT EXECUTE ON FUNCTION public.fetch_customer_by_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(uuid, uuid, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_ledger_entry(public.ledger_source_type, uuid, date, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_ledger_for_invoice(uuid) TO authenticated;
