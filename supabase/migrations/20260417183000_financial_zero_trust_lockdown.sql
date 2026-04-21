-- Zero-trust financial security lockdown for ERP critical operations.
-- This migration enforces server-side authorization so sensitive writes
-- are only possible through hardened SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION public.is_finance_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
  ) INTO v_is_admin;

  RETURN COALESCE(v_is_admin, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_finance_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_finance_admin() THEN
    RAISE EXCEPTION 'Admin role required for financial operation'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb,
  performed_by uuid NOT NULL DEFAULT auth.uid(),
  performed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financial_audit_logs_performed_at_idx
  ON public.financial_audit_logs (performed_at DESC);

CREATE INDEX IF NOT EXISTS financial_audit_logs_entity_idx
  ON public.financial_audit_logs (entity_type, entity_id, performed_at DESC);

ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'financial_audit_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.financial_audit_logs', r.policyname);
  END LOOP;
END
$$;

CREATE POLICY financial_audit_logs_admin_select
  ON public.financial_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_finance_admin());

REVOKE ALL ON TABLE public.financial_audit_logs FROM anon, authenticated;
GRANT SELECT ON TABLE public.financial_audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.log_financial_action(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
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
    performed_by
  )
  VALUES (
    COALESCE(NULLIF(btrim(p_action), ''), 'unknown_action'),
    COALESCE(NULLIF(btrim(p_entity_type), ''), 'unknown_entity'),
    p_entity_id,
    COALESCE(p_payload, '{}'::jsonb),
    auth.uid()
  );
END;
$$;

-- Lock down direct table writes. No INSERT/UPDATE/DELETE policies are created for critical tables.
DO $$
DECLARE
  t text;
  r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices',
    'invoice_items',
    'ledger_entries',
    'ledger_entry_lines',
    'purchases',
    'purchase_items',
    'inventory_movements'
  ] LOOP
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
      t || '_finance_admin_select',
      t
    );
  END LOOP;
END
$$;

-- Block direct execution of mutation primitives.
REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement(uuid, uuid, text, integer, text, uuid, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_balanced_ledger_entry(text, uuid, date, uuid, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_invoice_payment_status(uuid) FROM anon, authenticated;

-- Invoices are immutable for business/amount fields once posted.
CREATE OR REPLACE FUNCTION public.prevent_posted_invoice_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_posted boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Allow first-time posting enrichment before ledger posting exists.
  IF OLD.seller_state_code IS NULL
     AND OLD.customer_state_code IS NULL
     AND OLD.status IN ('issued', 'partially_paid', 'paid') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.ledger_entries le
      WHERE le.reference_type = 'invoice'
        AND le.reference_id = OLD.id
    ) INTO v_invoice_posted;

    IF NOT v_invoice_posted THEN
      RETURN NEW;
    END IF;
  END IF;

  IF OLD.status = 'cancelled' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
       OR NEW.balance_amount IS DISTINCT FROM OLD.balance_amount THEN
      RAISE EXCEPTION 'Cancelled invoices are immutable';
    END IF;
  END IF;

  IF (
    NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
    OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
    OR NEW.phone IS DISTINCT FROM OLD.phone
    OR NEW.address IS DISTINCT FROM OLD.address
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.cgst IS DISTINCT FROM OLD.cgst
    OR NEW.sgst IS DISTINCT FROM OLD.sgst
    OR NEW.igst IS DISTINCT FROM OLD.igst
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.is_interstate IS DISTINCT FROM OLD.is_interstate
    OR NEW.seller_state_code IS DISTINCT FROM OLD.seller_state_code
    OR NEW.customer_state_code IS DISTINCT FROM OLD.customer_state_code
  ) THEN
    RAISE EXCEPTION 'Invoice business values are immutable after posting';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_posted_invoice_mutation ON public.invoices;
CREATE TRIGGER trg_prevent_posted_invoice_mutation
BEFORE UPDATE ON public.invoices
FOR EACH ROW
WHEN (OLD.status IN ('issued', 'partially_paid', 'paid', 'cancelled'))
EXECUTE FUNCTION public.prevent_posted_invoice_mutation();

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
  PERFORM public.assert_finance_admin();

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
  v_invoice_id uuid;
  v_ledger_id uuid;
  v_order record;
  v_customer record;
  v_branch record;
  v_item record;
  v_subtotal numeric(12,2) := 0;
  v_cgst numeric(12,2) := 0;
  v_sgst numeric(12,2) := 0;
  v_igst numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_line_taxable numeric(12,2);
  v_line_tax numeric(12,2);
  v_line_cgst numeric(12,2);
  v_line_sgst numeric(12,2);
  v_line_igst numeric(12,2);
  v_line_total numeric(12,2);
  v_seller_state text;
  v_customer_state text;
  v_is_interstate boolean;
  v_lines jsonb;
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

  v_invoice_id := public.create_invoice_from_order(p_order_id);
  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice could not be created for order %', p_order_id;
  END IF;

  SELECT b.id, public.normalize_state_code(b.state_code) AS state_code
  INTO v_branch
  FROM public.branches b
  WHERE b.id = v_order.branch_id;

  SELECT c.id, public.normalize_state_code(c.state_code) AS state_code
  INTO v_customer
  FROM public.customers c
  WHERE c.id = v_order.customer_id;

  v_seller_state := COALESCE(v_branch.state_code, public.normalize_state_code(v_order.customer_state_code));
  v_customer_state := COALESCE(public.normalize_state_code(p_customer_state_code), v_customer.state_code, public.normalize_state_code(v_order.customer_state_code));

  IF v_seller_state IS NULL OR v_customer_state IS NULL THEN
    RAISE EXCEPTION 'Cannot determine GST regime. Provide branch/customer state codes first';
  END IF;

  v_is_interstate := (v_seller_state <> v_customer_state);

  -- If already posted, return existing immutable values.
  SELECT le.id
  INTO v_ledger_id
  FROM public.ledger_entries le
  WHERE le.reference_type = 'invoice'
    AND le.reference_id = v_invoice_id
  LIMIT 1;

  IF v_ledger_id IS NOT NULL THEN
    SELECT i.subtotal, i.cgst, i.sgst, i.igst, i.total, i.is_interstate
    INTO v_subtotal, v_cgst, v_sgst, v_igst, v_total, v_is_interstate
    FROM public.invoices i
    WHERE i.id = v_invoice_id;

    RETURN jsonb_build_object(
      'invoice_id', v_invoice_id,
      'ledger_entry_id', v_ledger_id,
      'subtotal', v_subtotal,
      'cgst', v_cgst,
      'sgst', v_sgst,
      'igst', v_igst,
      'total', v_total,
      'is_interstate', v_is_interstate
    );
  END IF;

  FOR v_item IN
    SELECT
      ii.id,
      ii.quantity,
      ii.unit_price,
      COALESCE(ii.gst_percentage, 0) AS gst_percentage
    FROM public.invoice_items ii
    WHERE ii.invoice_id = v_invoice_id
    FOR UPDATE
  LOOP
    v_line_taxable := ROUND(COALESCE(v_item.quantity, 0) * COALESCE(v_item.unit_price, 0), 2);
    v_line_tax := ROUND(v_line_taxable * COALESCE(v_item.gst_percentage, 0) / 100.0, 2);

    IF v_is_interstate THEN
      v_line_cgst := 0;
      v_line_sgst := 0;
      v_line_igst := v_line_tax;
    ELSE
      v_line_cgst := ROUND(v_line_tax / 2.0, 2);
      v_line_sgst := ROUND(v_line_tax - v_line_cgst, 2);
      v_line_igst := 0;
    END IF;

    v_line_total := ROUND(v_line_taxable + v_line_tax, 2);

    UPDATE public.invoice_items
    SET
      taxable_value = v_line_taxable,
      cgst_amount = v_line_cgst,
      sgst_amount = v_line_sgst,
      igst_amount = v_line_igst,
      total = v_line_total
    WHERE id = v_item.id;

    v_subtotal := v_subtotal + v_line_taxable;
    v_cgst := v_cgst + v_line_cgst;
    v_sgst := v_sgst + v_line_sgst;
    v_igst := v_igst + v_line_igst;
    v_total := v_total + v_line_total;
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);
  v_cgst := ROUND(v_cgst, 2);
  v_sgst := ROUND(v_sgst, 2);
  v_igst := ROUND(v_igst, 2);
  v_total := ROUND(v_total, 2);

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    cgst = v_cgst,
    sgst = v_sgst,
    igst = v_igst,
    total = v_total,
    round_off = 0,
    is_interstate = v_is_interstate,
    seller_state_code = v_seller_state,
    customer_state_code = v_customer_state,
    status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE 'issued' END,
    paid_amount = COALESCE(paid_amount, 0),
    balance_amount = v_total
  WHERE id = v_invoice_id;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1200', 'debit', v_total, 'credit', 0),
    jsonb_build_object('account_code', '3100', 'debit', 0, 'credit', v_subtotal)
  );

  IF v_cgst > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2101', 'debit', 0, 'credit', v_cgst)
    );
  END IF;

  IF v_sgst > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2102', 'debit', 0, 'credit', v_sgst)
    );
  END IF;

  IF v_igst > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2103', 'debit', 0, 'credit', v_igst)
    );
  END IF;

  v_ledger_id := public.create_balanced_ledger_entry(
    'invoice',
    v_invoice_id,
    CURRENT_DATE,
    v_order.branch_id,
    'Invoice posting',
    v_lines
  );

  PERFORM public.log_financial_action(
    'create_invoice_with_ledger',
    'invoice',
    v_invoice_id,
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
    'invoice_id', v_invoice_id,
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
  v_invoice record;
  v_paid numeric(12,2);
  v_ledger_id uuid;
  v_payment_id uuid;
  v_account_code text;
  v_branch_id uuid;
BEGIN
  PERFORM public.assert_finance_admin();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be > 0';
  END IF;

  SELECT i.*, (
    SELECT o.branch_id
    FROM public.orders o
    WHERE o.id = i.order_id
  ) AS branch_id
  INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF v_invoice.branch_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve branch for invoice %', p_invoice_id;
  END IF;

  IF v_invoice.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot record payment for cancelled invoice %', p_invoice_id;
  END IF;

  v_paid := ROUND(COALESCE(v_invoice.paid_amount, 0), 2);

  IF ROUND(v_invoice.total - v_paid, 2) < ROUND(p_amount, 2) THEN
    RAISE EXCEPTION 'Payment exceeds outstanding amount. outstanding=%, attempted=%', ROUND(v_invoice.total - v_paid, 2), ROUND(p_amount, 2);
  END IF;

  v_account_code := COALESCE(
    NULLIF(btrim(p_account_code), ''),
    CASE WHEN lower(COALESCE(p_mode, '')) = 'cash' THEN '1101' ELSE '1102' END
  );

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
    p_invoice_id,
    CURRENT_DATE,
    ROUND(p_amount, 2),
    p_mode,
    p_reference_no,
    p_notes,
    auth.uid(),
    'receipt'
  )
  RETURNING id INTO v_payment_id;

  v_branch_id := v_invoice.branch_id;

  v_ledger_id := public.create_balanced_ledger_entry(
    'payment',
    v_payment_id,
    CURRENT_DATE,
    v_branch_id,
    'Invoice payment receipt',
    jsonb_build_array(
      jsonb_build_object('account_code', v_account_code, 'debit', ROUND(p_amount, 2), 'credit', 0),
      jsonb_build_object('account_code', '1200', 'debit', 0, 'credit', ROUND(p_amount, 2))
    )
  );

  PERFORM public.refresh_invoice_payment_status(p_invoice_id);

  PERFORM public.log_financial_action(
    'record_payment',
    'invoice_payment',
    v_payment_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'amount', ROUND(p_amount, 2),
      'mode', p_mode,
      'reference_no', p_reference_no,
      'ledger_entry_id', v_ledger_id
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'ledger_entry_id', v_ledger_id,
    'invoice_id', p_invoice_id,
    'amount', ROUND(p_amount, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_refund(
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
  v_invoice record;
  v_paid numeric(12,2);
  v_ledger_id uuid;
  v_payment_id uuid;
  v_account_code text;
BEGIN
  PERFORM public.assert_finance_admin();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be > 0';
  END IF;

  SELECT i.*, (
    SELECT o.branch_id
    FROM public.orders o
    WHERE o.id = i.order_id
  ) AS branch_id
  INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  v_paid := ROUND(COALESCE(v_invoice.paid_amount, 0), 2);
  IF v_paid < ROUND(p_amount, 2) THEN
    RAISE EXCEPTION 'Refund exceeds paid amount. paid=%, requested=%', v_paid, ROUND(p_amount, 2);
  END IF;

  v_account_code := COALESCE(
    NULLIF(btrim(p_account_code), ''),
    CASE WHEN lower(COALESCE(p_mode, '')) = 'cash' THEN '1101' ELSE '1102' END
  );

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
    p_invoice_id,
    CURRENT_DATE,
    ROUND(p_amount, 2),
    p_mode,
    p_reference_no,
    p_notes,
    auth.uid(),
    'refund'
  )
  RETURNING id INTO v_payment_id;

  v_ledger_id := public.create_balanced_ledger_entry(
    'payment',
    v_payment_id,
    CURRENT_DATE,
    v_invoice.branch_id,
    'Invoice payment refund',
    jsonb_build_array(
      jsonb_build_object('account_code', '1200', 'debit', ROUND(p_amount, 2), 'credit', 0),
      jsonb_build_object('account_code', v_account_code, 'debit', 0, 'credit', ROUND(p_amount, 2))
    )
  );

  PERFORM public.refresh_invoice_payment_status(p_invoice_id);

  PERFORM public.log_financial_action(
    'record_refund',
    'invoice_payment',
    v_payment_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'amount', ROUND(p_amount, 2),
      'mode', p_mode,
      'reference_no', p_reference_no,
      'ledger_entry_id', v_ledger_id
    )
  );

  RETURN jsonb_build_object(
    'refund_id', v_payment_id,
    'ledger_entry_id', v_ledger_id,
    'invoice_id', p_invoice_id,
    'amount', ROUND(p_amount, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_invoice_with_reversal(
  p_invoice_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_existing_reversal uuid;
  v_ledger_id uuid;
BEGIN
  PERFORM public.assert_finance_admin();

  SELECT i.*, (
    SELECT o.branch_id
    FROM public.orders o
    WHERE o.id = i.order_id
  ) AS branch_id
  INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF v_invoice.branch_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve branch for invoice %', p_invoice_id;
  END IF;

  IF v_invoice.status = 'cancelled' THEN
    RETURN jsonb_build_object('invoice_id', p_invoice_id, 'status', 'cancelled', 'message', 'Already cancelled');
  END IF;

  IF COALESCE(v_invoice.paid_amount, 0) > 0 THEN
    RAISE EXCEPTION 'Invoice % has payments. Refund/reverse payments first, then cancel', p_invoice_id;
  END IF;

  SELECT le.id
  INTO v_existing_reversal
  FROM public.ledger_entries le
  WHERE le.reference_type = 'invoice_cancel'
    AND le.reference_id = p_invoice_id
  LIMIT 1;

  IF v_existing_reversal IS NULL THEN
    v_ledger_id := public.create_balanced_ledger_entry(
      'invoice_cancel',
      p_invoice_id,
      CURRENT_DATE,
      v_invoice.branch_id,
      COALESCE(p_reason, 'Invoice cancellation reversal'),
      jsonb_build_array(
        jsonb_build_object('account_code', '3100', 'debit', ROUND(v_invoice.subtotal, 2), 'credit', 0),
        jsonb_build_object('account_code', '1200', 'debit', 0, 'credit', ROUND(v_invoice.total, 2)),
        jsonb_build_object('account_code', '2101', 'debit', ROUND(v_invoice.cgst, 2), 'credit', 0),
        jsonb_build_object('account_code', '2102', 'debit', ROUND(v_invoice.sgst, 2), 'credit', 0),
        jsonb_build_object('account_code', '2103', 'debit', ROUND(v_invoice.igst, 2), 'credit', 0)
      )
    );
  ELSE
    v_ledger_id := v_existing_reversal;
  END IF;

  UPDATE public.invoices
  SET
    status = 'cancelled',
    paid_amount = 0,
    balance_amount = 0
  WHERE id = p_invoice_id;

  PERFORM public.log_financial_action(
    'cancel_invoice_with_reversal',
    'invoice',
    p_invoice_id,
    jsonb_build_object(
      'ledger_entry_id', v_ledger_id,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'ledger_entry_id', v_ledger_id,
    'status', 'cancelled'
  );
END;
$$;

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

  v_seller_state := v_branch.state_code;
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
  PERFORM public.assert_finance_admin();

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

-- Public-facing RPC entry points still callable by authenticated users,
-- but now enforce DB-side admin checks via assert_finance_admin().
GRANT EXECUTE ON FUNCTION public.create_invoice_with_ledger(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_ledger(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund(uuid, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_with_reversal(uuid, text) TO authenticated;

-- Keep internal utility functions non-public.
REVOKE EXECUTE ON FUNCTION public.create_balanced_ledger_entry(text, uuid, date, uuid, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_invoice_payment_status(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_finance_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_finance_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_finance_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(uuid, uuid, integer, text, uuid) TO authenticated;
