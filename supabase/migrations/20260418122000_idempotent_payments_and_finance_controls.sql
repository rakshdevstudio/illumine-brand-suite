-- Canonical idempotent payments + finance controls for Illume ERP.
-- Adds unified payments, invoice FY numbering, audit expansion,
-- and admin-safe balance posting through SECURITY DEFINER RPCs.

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_amount numeric(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.financial_year_label(p_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_start_year integer;
  v_end_year integer;
BEGIN
  IF EXTRACT(MONTH FROM p_date) >= 4 THEN
    v_start_year := EXTRACT(YEAR FROM p_date)::integer;
    v_end_year := v_start_year + 1;
  ELSE
    v_end_year := EXTRACT(YEAR FROM p_date)::integer;
    v_start_year := v_end_year - 1;
  END IF;

  RETURN v_start_year::text || '-' || right(v_end_year::text, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_created_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_date date := COALESCE(p_created_at::date, CURRENT_DATE);
  v_fy text := public.financial_year_label(v_date);
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('illume-invoice-number-' || v_fy));

  SELECT COALESCE(MAX(split_part(invoice_number, '-', 4)::integer), 0) + 1
  INTO v_next
  FROM public.invoices
  WHERE invoice_number LIKE 'ILL-' || v_fy || '-%'
    AND invoice_number ~ ('^ILL-' || v_fy || '-[0-9]+$');

  RETURN 'ILL-' || v_fy || '-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_type text NOT NULL CHECK (reference_type IN ('invoice', 'purchase')),
  reference_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_mode text NOT NULL CHECK (payment_mode IN ('cash', 'bank', 'upi')),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  idempotency_key text NOT NULL,
  ledger_entry_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS payments_reference_idx
  ON public.payments (reference_type, reference_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS payments_created_at_idx
  ON public.payments (created_at DESC);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.payments', r.policyname);
  END LOOP;
END
$$;

CREATE POLICY payments_admin_select
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (public.is_finance_admin());

REVOKE ALL ON TABLE public.payments FROM anon, authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;

ALTER TABLE public.financial_audit_logs
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS before_data jsonb,
  ADD COLUMN IF NOT EXISTS after_data jsonb;

CREATE OR REPLACE FUNCTION public.log_financial_action(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_request_id text DEFAULT NULL,
  p_source text DEFAULT 'rpc',
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_audit_logs (
    action,
    entity_type,
    entity_id,
    payload,
    request_id,
    source,
    before_data,
    after_data,
    performed_by
  )
  VALUES (
    COALESCE(NULLIF(btrim(p_action), ''), 'unknown_action'),
    COALESCE(NULLIF(btrim(p_entity_type), ''), 'unknown_entity'),
    p_entity_id,
    COALESCE(p_payload, '{}'::jsonb),
    p_request_id,
    p_source,
    p_before,
    p_after,
    auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_system_account_code(p_key text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := lower(btrim(COALESCE(p_key, '')));
  v_code text;
BEGIN
  SELECT a.code
  INTO v_code
  FROM public.accounts a
  WHERE a.is_active = true
    AND (
      lower(a.code) = v_key
      OR lower(a.name) = v_key
      OR (v_key = 'cash' AND lower(a.name) LIKE '%cash%')
      OR (v_key = 'bank' AND lower(a.name) LIKE '%bank%')
      OR (v_key = 'receivable' AND lower(a.name) LIKE '%receivable%')
      OR (v_key = 'payable' AND lower(a.name) LIKE '%payable%')
      OR (v_key = 'sales_revenue' AND lower(a.name) LIKE '%sales%revenue%')
      OR (v_key = 'input_cgst' AND lower(a.name) LIKE '%input%cgst%')
      OR (v_key = 'input_sgst' AND lower(a.name) LIKE '%input%sgst%')
      OR (v_key = 'input_igst' AND lower(a.name) LIKE '%input%igst%')
      OR (v_key = 'output_cgst' AND lower(a.name) LIKE '%output%cgst%')
      OR (v_key = 'output_sgst' AND lower(a.name) LIKE '%output%sgst%')
      OR (v_key = 'output_igst' AND lower(a.name) LIKE '%output%igst%')
    )
  ORDER BY CASE WHEN lower(a.code) = v_key THEN 0 ELSE 1 END, a.code
  LIMIT 1;

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  RETURN CASE v_key
    WHEN 'cash' THEN '1101'
    WHEN 'bank' THEN '1102'
    WHEN 'receivable' THEN '1200'
    WHEN 'payable' THEN '2200'
    WHEN 'sales_revenue' THEN '3100'
    WHEN 'input_cgst' THEN '1210'
    WHEN 'input_sgst' THEN '1211'
    WHEN 'input_igst' THEN '1212'
    WHEN 'output_cgst' THEN '2101'
    WHEN 'output_sgst' THEN '2102'
    WHEN 'output_igst' THEN '2103'
    ELSE NULL
  END;
END;
$$;

CREATE TABLE IF NOT EXISTS public.inventory_valuation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  valuation_method text NOT NULL DEFAULT 'moving_average' CHECK (valuation_method IN ('moving_average', 'fifo')),
  qty_on_hand integer NOT NULL DEFAULT 0,
  avg_cost numeric(12,2) NOT NULL DEFAULT 0,
  last_cost numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_valuation_branch_variant_unique UNIQUE (branch_id, variant_id)
);

CREATE INDEX IF NOT EXISTS inventory_valuation_branch_idx
  ON public.inventory_valuation (branch_id, variant_id);

ALTER TABLE public.inventory_valuation ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inventory_valuation'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_valuation', r.policyname);
  END LOOP;
END
$$;

CREATE POLICY inventory_valuation_admin_select
  ON public.inventory_valuation
  FOR SELECT
  TO authenticated
  USING (public.is_finance_admin());

REVOKE ALL ON TABLE public.inventory_valuation FROM anon, authenticated;
GRANT SELECT ON TABLE public.inventory_valuation TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_stock_before_sale(
  p_branch_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be > 0';
  END IF;

  SELECT bi.stock
  INTO v_stock
  FROM public.branch_inventory bi
  WHERE bi.branch_id = p_branch_id
    AND bi.variant_id = p_variant_id
  FOR UPDATE;

  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'Stock row not found for branch % variant %', p_branch_id, p_variant_id;
  END IF;

  IF v_stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. available=%, required=%', v_stock, p_quantity;
  END IF;

  RETURN jsonb_build_object(
    'branch_id', p_branch_id,
    'variant_id', p_variant_id,
    'available', v_stock,
    'required', p_quantity,
    'ok', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment(
  p_reference_type text,
  p_reference_id uuid,
  p_amount numeric,
  p_mode text,
  p_idempotency_key text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reference_type text := lower(btrim(COALESCE(p_reference_type, '')));
  v_payment_mode text := lower(btrim(COALESCE(p_mode, '')));
  v_existing_payment record;
  v_payment_id uuid;
  v_ledger_id uuid;
  v_cash_account text;
  v_counter_account text;
  v_before jsonb;
  v_after jsonb;
  v_invoice record;
  v_purchase record;
  v_branch_id uuid;
  v_paid numeric(12,2);
  v_balance numeric(12,2);
BEGIN
  PERFORM public.assert_finance_admin();

  IF v_reference_type NOT IN ('invoice', 'purchase') THEN
    RAISE EXCEPTION 'reference_type must be invoice or purchase';
  END IF;

  IF p_reference_id IS NULL THEN
    RAISE EXCEPTION 'reference_id is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be > 0';
  END IF;

  IF v_payment_mode NOT IN ('cash', 'bank', 'upi') THEN
    RAISE EXCEPTION 'payment mode must be cash, bank, or upi';
  END IF;

  IF COALESCE(btrim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  SELECT *
  INTO v_existing_payment
  FROM public.payments p
  WHERE p.idempotency_key = p_idempotency_key
    AND p.reference_type = v_reference_type
    AND p.reference_id = p_reference_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'payment_id', v_existing_payment.id,
      'ledger_entry_id', v_existing_payment.ledger_entry_id,
      'reference_type', v_existing_payment.reference_type,
      'reference_id', v_existing_payment.reference_id,
      'amount', v_existing_payment.amount,
      'payment_mode', v_existing_payment.payment_mode,
      'payment_date', v_existing_payment.payment_date,
      'idempotency_key', v_existing_payment.idempotency_key,
      'duplicate', true
    );
  END IF;

  v_cash_account := CASE WHEN v_payment_mode = 'cash' THEN public.get_system_account_code('cash') ELSE public.get_system_account_code('bank') END;

  IF v_reference_type = 'invoice' THEN
    SELECT i.*, (
      SELECT o.branch_id
      FROM public.orders o
      WHERE o.id = i.order_id
    ) AS branch_id
    INTO v_invoice
    FROM public.invoices i
    WHERE i.id = p_reference_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice % not found', p_reference_id;
    END IF;

    IF v_invoice.status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot record payment for cancelled invoice %', p_reference_id;
    END IF;

    v_branch_id := v_invoice.branch_id;

    IF v_branch_id IS NULL THEN
      RAISE EXCEPTION 'Unable to resolve branch for invoice %', p_reference_id;
    END IF;

    v_before := jsonb_build_object(
      'paid_amount', COALESCE(v_invoice.paid_amount, 0),
      'balance_amount', COALESCE(v_invoice.balance_amount, v_invoice.total),
      'status', v_invoice.status
    );

    v_paid := ROUND(COALESCE(v_invoice.paid_amount, 0) + p_amount, 2);
    v_balance := ROUND(v_invoice.total - v_paid, 2);

    IF v_balance < 0 THEN
      RAISE EXCEPTION 'Payment exceeds outstanding amount. outstanding=%, attempted=%', ROUND(v_invoice.total - COALESCE(v_invoice.paid_amount, 0), 2), ROUND(p_amount, 2);
    END IF;

    v_counter_account := public.get_system_account_code('receivable');

    v_ledger_id := public.create_balanced_ledger_entry(
      'payment',
      p_reference_id,
      CURRENT_DATE,
      v_branch_id,
      'Invoice payment receipt',
      jsonb_build_array(
        jsonb_build_object('account_code', v_cash_account, 'debit', ROUND(p_amount, 2), 'credit', 0),
        jsonb_build_object('account_code', v_counter_account, 'debit', 0, 'credit', ROUND(p_amount, 2))
      )
    );

    UPDATE public.invoices
    SET
      paid_amount = v_paid,
      balance_amount = v_balance,
      status = CASE
        WHEN v_balance <= 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partially_paid'
        ELSE 'issued'
      END
    WHERE id = p_reference_id;

    INSERT INTO public.invoice_payments (
      invoice_id,
      payment_date,
      amount,
      mode,
      reference_no,
      notes,
      created_by,
      direction
    )
    VALUES (
      p_reference_id,
      CURRENT_DATE,
      ROUND(p_amount, 2),
      v_payment_mode,
      p_idempotency_key,
      p_notes,
      auth.uid(),
      'receipt'
    );

    v_after := jsonb_build_object(
      'paid_amount', v_paid,
      'balance_amount', v_balance,
      'status', CASE WHEN v_balance <= 0 THEN 'paid' WHEN v_paid > 0 THEN 'partially_paid' ELSE 'issued' END
    );
  ELSE
    SELECT p.*
    INTO v_purchase
    FROM public.purchases p
    WHERE p.id = p_reference_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase % not found', p_reference_id;
    END IF;

    v_before := jsonb_build_object(
      'paid_amount', COALESCE(v_purchase.paid_amount, 0),
      'balance_amount', COALESCE(v_purchase.balance_amount, v_purchase.total),
      'status', v_purchase.status
    );

    v_paid := ROUND(COALESCE(v_purchase.paid_amount, 0) + p_amount, 2);
    v_balance := ROUND(v_purchase.total - v_paid, 2);

    IF v_balance < 0 THEN
      RAISE EXCEPTION 'Payment exceeds outstanding amount. outstanding=%, attempted=%', ROUND(v_purchase.total - COALESCE(v_purchase.paid_amount, 0), 2), ROUND(p_amount, 2);
    END IF;

    v_counter_account := public.get_system_account_code('payable');

    v_ledger_id := public.create_balanced_ledger_entry(
      'payment',
      p_reference_id,
      CURRENT_DATE,
      v_purchase.branch_id,
      'Purchase payment',
      jsonb_build_array(
        jsonb_build_object('account_code', v_counter_account, 'debit', ROUND(p_amount, 2), 'credit', 0),
        jsonb_build_object('account_code', v_cash_account, 'debit', 0, 'credit', ROUND(p_amount, 2))
      )
    );

    UPDATE public.purchases
    SET
      paid_amount = v_paid,
      balance_amount = v_balance
    WHERE id = p_reference_id;

    v_after := jsonb_build_object(
      'paid_amount', v_paid,
      'balance_amount', v_balance,
      'status', v_purchase.status
    );
  END IF;

  INSERT INTO public.payments (
    reference_type,
    reference_id,
    amount,
    payment_mode,
    payment_date,
    notes,
    idempotency_key,
    ledger_entry_id,
    created_by
  )
  VALUES (
    v_reference_type,
    p_reference_id,
    ROUND(p_amount, 2),
    v_payment_mode,
    CURRENT_DATE,
    p_notes,
    p_idempotency_key,
    v_ledger_id,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  PERFORM public.log_financial_action(
    'record_payment',
    v_reference_type,
    p_reference_id,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', ROUND(p_amount, 2),
      'mode', v_payment_mode,
      'ledger_entry_id', v_ledger_id,
      'idempotency_key', p_idempotency_key
    ),
    p_idempotency_key,
    'rpc',
    v_before,
    v_after
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'ledger_entry_id', v_ledger_id,
    'reference_type', v_reference_type,
    'reference_id', p_reference_id,
    'amount', ROUND(p_amount, 2),
    'payment_mode', v_payment_mode,
    'idempotency_key', p_idempotency_key
  );
END;
$$;

-- Legacy wrapper retained for existing callers; route them through canonical payments.
CREATE OR REPLACE FUNCTION public.record_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_mode text DEFAULT 'bank',
  p_reference_no text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_account_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idempotency_key text := COALESCE(NULLIF(btrim(p_reference_no), ''), 'legacy-' || p_invoice_id::text || '-' || to_char(COALESCE(p_amount, 0), 'FM9999999990.00') || '-' || lower(COALESCE(p_mode, 'bank')));
BEGIN
  RETURN public.record_payment('invoice', p_invoice_id, p_amount, p_mode, v_idempotency_key, p_notes);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_stock_before_sale(
  p_branch_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be > 0';
  END IF;

  SELECT bi.stock
  INTO v_stock
  FROM public.branch_inventory bi
  WHERE bi.branch_id = p_branch_id
    AND bi.variant_id = p_variant_id
  FOR UPDATE;

  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'Stock row not found for branch % variant %', p_branch_id, p_variant_id;
  END IF;

  IF v_stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. available=%, required=%', v_stock, p_quantity;
  END IF;

  RETURN jsonb_build_object(
    'branch_id', p_branch_id,
    'variant_id', p_variant_id,
    'available', v_stock,
    'required', p_quantity,
    'ok', true
  );
END;
$$;

-- Financial tables stay read-only outside SECURITY DEFINER RPCs.
DO $$
DECLARE
  t text;
  r record;
BEGIN
  FOREACH t IN ARRAY ARRAY['payments', 'inventory_valuation'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_finance_admin())',
      t || '_admin_select',
      t
    );
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.validate_stock_before_sale(uuid, uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_stock_before_sale(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(text, uuid, numeric, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, text, text, text) TO authenticated;
