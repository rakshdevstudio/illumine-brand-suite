-- Enterprise financial single-source-of-truth refactor.
-- Revenue/cash/outstanding are derived from invoices + payments only.

-- -----------------------------------------------------------------------------
-- 1) Schema hardening for due date, GST rounding, and line pricing mode
-- -----------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS credit_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounding_adjustment numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS price_includes_tax boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS line_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_tax numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.invoices
  ALTER COLUMN paid_amount SET DEFAULT 0,
  ALTER COLUMN balance_amount SET DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2) Mandatory invariants at DB level
-- -----------------------------------------------------------------------------
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_paid_amount_non_negative_chk;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_balance_amount_non_negative_chk;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_paid_not_over_total_chk;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_balance_formula_chk;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amount_positive_chk;

-- Pre-normalize legacy rows so strict invoice invariants can be added safely.
WITH canonical_invoice_payments AS (
  SELECT
    p.reference_id AS invoice_id,
    ROUND(COALESCE(SUM(p.amount), 0), 2) AS paid_total
  FROM public.payments p
  WHERE p.reference_type = 'invoice'
  GROUP BY p.reference_id
)
UPDATE public.invoices i
SET
  paid_amount = GREATEST(
    0,
    LEAST(
      ROUND(COALESCE(cip.paid_total, i.paid_amount, 0), 2),
      ROUND(COALESCE(i.total, 0), 2)
    )
  ),
  balance_amount = ROUND(
    COALESCE(i.total, 0)
    - GREATEST(
      0,
      LEAST(
        ROUND(COALESCE(cip.paid_total, i.paid_amount, 0), 2),
        ROUND(COALESCE(i.total, 0), 2)
      )
    ),
    2
  )
FROM canonical_invoice_payments cip
WHERE cip.invoice_id = i.id;

-- For invoices without a canonical payments row, still enforce non-negative/clamped values.
UPDATE public.invoices i
SET
  paid_amount = GREATEST(
    0,
    LEAST(
      ROUND(COALESCE(i.paid_amount, 0), 2),
      ROUND(COALESCE(i.total, 0), 2)
    )
  ),
  balance_amount = ROUND(
    COALESCE(i.total, 0)
    - GREATEST(
      0,
      LEAST(
        ROUND(COALESCE(i.paid_amount, 0), 2),
        ROUND(COALESCE(i.total, 0), 2)
      )
    ),
    2
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM public.payments p
  WHERE p.reference_type = 'invoice'
    AND p.reference_id = i.id
);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_paid_amount_non_negative_chk
    CHECK (paid_amount >= 0),
  ADD CONSTRAINT invoices_balance_amount_non_negative_chk
    CHECK (balance_amount >= 0),
  ADD CONSTRAINT invoices_paid_not_over_total_chk
    CHECK (paid_amount <= total),
  ADD CONSTRAINT invoices_balance_formula_chk
    CHECK (ROUND(balance_amount, 2) = ROUND(total - paid_amount, 2));

ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_positive_chk
    CHECK (amount > 0);

-- -----------------------------------------------------------------------------
-- 3) Due date and GST helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_payment_mode(p_mode text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(COALESCE(p_mode, '')))
    WHEN 'cash' THEN 'cash'
    WHEN 'bank' THEN 'bank'
    WHEN 'upi' THEN 'upi'
    ELSE 'bank'
  END;
$$;

CREATE OR REPLACE FUNCTION public.compute_gst_line_values_v2(
  p_quantity integer,
  p_unit_price numeric,
  p_gst_rate numeric,
  p_price_includes_tax boolean,
  p_is_interstate boolean
)
RETURNS TABLE(
  line_subtotal numeric,
  line_tax numeric,
  line_cgst numeric,
  line_sgst numeric,
  line_igst numeric,
  line_total numeric
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_qty numeric(18,6) := COALESCE(p_quantity, 0);
  v_unit numeric(18,6) := COALESCE(p_unit_price, 0);
  v_rate numeric(18,6) := GREATEST(COALESCE(p_gst_rate, 0), 0);
  v_sub numeric(18,6);
  v_tax numeric(18,6);
  v_total numeric(18,6);
BEGIN
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be > 0';
  END IF;

  IF v_unit < 0 THEN
    RAISE EXCEPTION 'Unit price cannot be negative';
  END IF;

  IF COALESCE(p_price_includes_tax, true) THEN
    v_total := v_qty * v_unit;
    IF v_rate = 0 THEN
      v_sub := v_total;
      v_tax := 0;
    ELSE
      v_sub := v_total / (1 + v_rate / 100.0);
      v_tax := v_total - v_sub;
    END IF;
  ELSE
    v_sub := v_qty * v_unit;
    v_tax := v_sub * v_rate / 100.0;
    v_total := v_sub + v_tax;
  END IF;

  line_subtotal := ROUND(v_sub, 2);
  line_tax := ROUND(v_tax, 2);

  IF p_is_interstate THEN
    line_cgst := 0;
    line_sgst := 0;
    line_igst := ROUND(v_tax, 2);
  ELSE
    line_cgst := ROUND(v_tax / 2.0, 2);
    line_sgst := ROUND(v_tax - (v_tax / 2.0), 2);
    line_igst := 0;
  END IF;

  line_total := ROUND(v_total, 2);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_set_invoice_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.due_date IS NULL THEN
    NEW.due_date := COALESCE(NEW.created_at, now())::date + COALESCE(NEW.credit_days, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_invoice_due_date ON public.invoices;
CREATE TRIGGER trg_set_invoice_due_date
BEFORE INSERT OR UPDATE OF due_date, created_at, credit_days ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_invoice_due_date();

-- -----------------------------------------------------------------------------
-- 4) Mutation guards (no direct writes on posted financial data)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_invoice_direct_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(current_setting('app.bypass_invoice_guard', true), 'off') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Direct mutation on invoices is blocked. Use approved RPC functions.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_direct_mutation ON public.invoices;
CREATE TRIGGER trg_guard_invoice_direct_mutation
BEFORE UPDATE OR DELETE ON public.invoices
FOR EACH ROW
WHEN (OLD.status IN ('issued', 'partially_paid', 'paid', 'cancelled'))
EXECUTE FUNCTION public.guard_invoice_direct_mutation();

CREATE OR REPLACE FUNCTION public.guard_ledger_direct_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(current_setting('app.bypass_ledger_guard', true), 'off') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION 'Direct mutation on ledger tables is blocked. Use approved RPC functions.';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_ledger_entries_direct_mutation ON public.ledger_entries;
CREATE TRIGGER trg_guard_ledger_entries_direct_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION public.guard_ledger_direct_mutation();

DROP TRIGGER IF EXISTS trg_guard_ledger_entry_lines_direct_mutation ON public.ledger_entry_lines;
CREATE TRIGGER trg_guard_ledger_entry_lines_direct_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.ledger_entry_lines
FOR EACH ROW
EXECUTE FUNCTION public.guard_ledger_direct_mutation();

-- -----------------------------------------------------------------------------
-- 5) Ledger balancing invariant (debits must equal credits)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_ledger_entry_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ledger_entry_id uuid;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
  v_line_count integer;
BEGIN
  v_ledger_entry_id := COALESCE(NEW.ledger_entry_id, OLD.ledger_entry_id);

  IF v_ledger_entry_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(SUM(COALESCE(debit, 0)), 0),
    COALESCE(SUM(COALESCE(credit, 0)), 0),
    COUNT(*)
  INTO v_debit, v_credit, v_line_count
  FROM public.ledger_entry_lines
  WHERE ledger_entry_id = v_ledger_entry_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Ledger entry % cannot be empty', v_ledger_entry_id;
  END IF;

  IF ROUND(v_debit, 2) <> ROUND(v_credit, 2) THEN
    RAISE EXCEPTION 'Unbalanced ledger entry %. debit=%, credit=%', v_ledger_entry_id, ROUND(v_debit, 2), ROUND(v_credit, 2);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_ledger_entry_balanced ON public.ledger_entry_lines;
CREATE CONSTRAINT TRIGGER trg_assert_ledger_entry_balanced
AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entry_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.assert_ledger_entry_balanced();

-- -----------------------------------------------------------------------------
-- 6) Canonical invoice-item math and invoice header recomputation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_compute_invoice_item_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_interstate boolean := false;
  v_calc record;
BEGIN
  SELECT COALESCE(i.is_interstate, false)
  INTO v_is_interstate
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;

  SELECT *
  INTO v_calc
  FROM public.compute_gst_line_values_v2(
    NEW.quantity,
    NEW.unit_price,
    COALESCE(NEW.gst_percentage, 0),
    COALESCE(NEW.price_includes_tax, true),
    v_is_interstate
  );

  NEW.taxable_value := v_calc.line_subtotal;
  NEW.line_subtotal := v_calc.line_subtotal;
  NEW.line_tax := v_calc.line_tax;
  NEW.cgst_amount := v_calc.line_cgst;
  NEW.sgst_amount := v_calc.line_sgst;
  NEW.igst_amount := v_calc.line_igst;
  NEW.total := v_calc.line_total;
  NEW.pricing_type := CASE WHEN COALESCE(NEW.price_includes_tax, true) THEN 'inclusive' ELSE 'exclusive' END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_invoice_item_values ON public.invoice_items;
CREATE TRIGGER trg_compute_invoice_item_values
BEFORE INSERT OR UPDATE OF quantity, unit_price, gst_percentage, price_includes_tax, invoice_id ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_compute_invoice_item_values();

CREATE OR REPLACE FUNCTION public.recompute_invoice_financials(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal numeric(12,2) := 0;
  v_cgst numeric(12,2) := 0;
  v_sgst numeric(12,2) := 0;
  v_igst numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_unrounded_total numeric(18,6) := 0;
  v_rounding numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_status text;
BEGIN
  SELECT
    ROUND(COALESCE(SUM(ii.line_subtotal), 0), 2),
    ROUND(COALESCE(SUM(ii.cgst_amount), 0), 2),
    ROUND(COALESCE(SUM(ii.sgst_amount), 0), 2),
    ROUND(COALESCE(SUM(ii.igst_amount), 0), 2),
    ROUND(COALESCE(SUM(CASE
      WHEN COALESCE(ii.price_includes_tax, true)
        THEN (ii.quantity::numeric * ii.unit_price::numeric)
      ELSE (ii.quantity::numeric * ii.unit_price::numeric) * (1 + COALESCE(ii.gst_percentage, 0)::numeric / 100.0)
    END), 0), 6)
  INTO v_subtotal, v_cgst, v_sgst, v_igst, v_unrounded_total
  FROM public.invoice_items ii
  WHERE ii.invoice_id = p_invoice_id;

  v_tax := ROUND(v_cgst + v_sgst + v_igst, 2);
  v_total := ROUND(v_unrounded_total, 2);
  v_rounding := ROUND(v_total - ROUND(v_subtotal + v_tax, 2), 2);

  SELECT ROUND(COALESCE(i.paid_amount, 0), 2), i.status
  INTO v_paid, v_status
  FROM public.invoices i
  WHERE i.id = p_invoice_id
  FOR UPDATE;

  PERFORM set_config('app.bypass_invoice_guard', 'on', true);

  UPDATE public.invoices i
  SET
    subtotal = v_subtotal,
    cgst = v_cgst,
    sgst = v_sgst,
    igst = v_igst,
    total = v_total,
    rounding_adjustment = v_rounding,
    balance_amount = ROUND(v_total - v_paid, 2),
    status = CASE
      WHEN i.status = 'cancelled' THEN 'cancelled'
      WHEN ROUND(v_total - v_paid, 2) <= 0 THEN 'paid'
      WHEN v_paid > 0 THEN 'partially_paid'
      ELSE 'issued'
    END
  WHERE i.id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_invoice_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_invoice_financials(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_invoice_from_items ON public.invoice_items;
CREATE TRIGGER trg_recompute_invoice_from_items
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_invoice_from_items();

-- -----------------------------------------------------------------------------
-- 7) Canonical balanced ledger creation (guard-aware)
-- -----------------------------------------------------------------------------
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

  PERFORM set_config('app.bypass_ledger_guard', 'on', true);

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

  RETURN v_entry_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8) Canonical idempotent payment system (single source)
-- -----------------------------------------------------------------------------
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
  v_mode text := public.normalize_payment_mode(p_mode);
  v_existing public.payments%ROWTYPE;
  v_invoice record;
  v_purchase record;
  v_payment_id uuid;
  v_ledger_id uuid;
  v_cash_account text;
  v_counter_account text;
  v_new_paid numeric(12,2);
  v_new_balance numeric(12,2);
BEGIN
  PERFORM public.assert_finance_admin();

  IF v_reference_type NOT IN ('invoice', 'purchase') THEN
    RAISE EXCEPTION 'reference_type must be invoice or purchase';
  END IF;

  IF p_reference_id IS NULL THEN
    RAISE EXCEPTION 'reference_id is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  IF COALESCE(btrim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.payments
  WHERE idempotency_key = p_idempotency_key
    AND reference_type = v_reference_type
    AND reference_id = p_reference_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'payment_id', v_existing.id,
      'ledger_entry_id', v_existing.ledger_entry_id,
      'reference_type', v_existing.reference_type,
      'reference_id', v_existing.reference_id,
      'amount', v_existing.amount,
      'duplicate', true
    );
  END IF;

  v_cash_account := CASE WHEN v_mode = 'cash' THEN public.get_system_account_code('cash') ELSE public.get_system_account_code('bank') END;

  IF v_reference_type = 'invoice' THEN
    SELECT i.*, (
      SELECT o.branch_id FROM public.orders o WHERE o.id = i.order_id
    ) AS branch_id
    INTO v_invoice
    FROM public.invoices i
    WHERE i.id = p_reference_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice % not found', p_reference_id;
    END IF;

    IF v_invoice.status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot pay cancelled invoice %', p_reference_id;
    END IF;

    v_new_paid := ROUND(COALESCE(v_invoice.paid_amount, 0) + p_amount, 2);
    v_new_balance := ROUND(v_invoice.total - v_new_paid, 2);

    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'Overpayment blocked. outstanding=%, attempted=%', ROUND(v_invoice.total - COALESCE(v_invoice.paid_amount, 0), 2), ROUND(p_amount, 2);
    END IF;

    INSERT INTO public.payments (
      reference_type,
      reference_id,
      amount,
      payment_mode,
      payment_date,
      notes,
      idempotency_key,
      created_by
    ) VALUES (
      v_reference_type,
      p_reference_id,
      ROUND(p_amount, 2),
      v_mode,
      CURRENT_DATE,
      p_notes,
      p_idempotency_key,
      auth.uid()
    )
    RETURNING id INTO v_payment_id;

    PERFORM set_config('app.bypass_invoice_guard', 'on', true);

    UPDATE public.invoices
    SET
      paid_amount = v_new_paid,
      balance_amount = v_new_balance,
      status = CASE
        WHEN v_new_balance <= 0 THEN 'paid'
        WHEN v_new_paid > 0 THEN 'partially_paid'
        ELSE 'issued'
      END
    WHERE id = p_reference_id;

    v_counter_account := public.get_system_account_code('receivable');

    v_ledger_id := public.create_balanced_ledger_entry(
      'payment',
      v_payment_id,
      CURRENT_DATE,
      v_invoice.branch_id,
      'Invoice payment receipt',
      jsonb_build_array(
        jsonb_build_object('account_code', v_cash_account, 'debit', ROUND(p_amount, 2), 'credit', 0),
        jsonb_build_object('account_code', v_counter_account, 'debit', 0, 'credit', ROUND(p_amount, 2))
      )
    );

    UPDATE public.payments
    SET ledger_entry_id = v_ledger_id
    WHERE id = v_payment_id;

  ELSE
    SELECT p.*
    INTO v_purchase
    FROM public.purchases p
    WHERE p.id = p_reference_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase % not found', p_reference_id;
    END IF;

    v_new_paid := ROUND(COALESCE(v_purchase.paid_amount, 0) + p_amount, 2);
    v_new_balance := ROUND(v_purchase.total - v_new_paid, 2);

    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'Overpayment blocked. outstanding=%, attempted=%', ROUND(v_purchase.total - COALESCE(v_purchase.paid_amount, 0), 2), ROUND(p_amount, 2);
    END IF;

    INSERT INTO public.payments (
      reference_type,
      reference_id,
      amount,
      payment_mode,
      payment_date,
      notes,
      idempotency_key,
      created_by
    ) VALUES (
      v_reference_type,
      p_reference_id,
      ROUND(p_amount, 2),
      v_mode,
      CURRENT_DATE,
      p_notes,
      p_idempotency_key,
      auth.uid()
    )
    RETURNING id INTO v_payment_id;

    UPDATE public.purchases
    SET
      paid_amount = v_new_paid,
      balance_amount = v_new_balance
    WHERE id = p_reference_id;

    v_counter_account := public.get_system_account_code('payable');

    v_ledger_id := public.create_balanced_ledger_entry(
      'payment',
      v_payment_id,
      CURRENT_DATE,
      v_purchase.branch_id,
      'Purchase payment',
      jsonb_build_array(
        jsonb_build_object('account_code', v_counter_account, 'debit', ROUND(p_amount, 2), 'credit', 0),
        jsonb_build_object('account_code', v_cash_account, 'debit', 0, 'credit', ROUND(p_amount, 2))
      )
    );

    UPDATE public.payments
    SET ledger_entry_id = v_ledger_id
    WHERE id = v_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'ledger_entry_id', v_ledger_id,
    'reference_type', v_reference_type,
    'reference_id', p_reference_id,
    'amount', ROUND(p_amount, 2),
    'payment_mode', v_mode,
    'idempotency_key', p_idempotency_key,
    'duplicate', false
  );
END;
$$;

-- Backward-compatible wrapper retained for existing callers.
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
  v_key text;
BEGIN
  v_key := COALESCE(NULLIF(btrim(p_reference_no), ''), 'legacy-' || p_invoice_id::text || '-' || to_char(COALESCE(p_amount, 0), 'FM9999999990.00') || '-' || lower(COALESCE(p_mode, 'bank')));
  RETURN public.record_payment('invoice', p_invoice_id, p_amount, p_mode, v_key, p_notes);
END;
$$;

-- -----------------------------------------------------------------------------
-- 9) Reporting layer: views only from invoices + payments
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.view_revenue_summary;
DROP VIEW IF EXISTS public.view_outstanding_summary;
DROP VIEW IF EXISTS public.view_aging_buckets;
DROP VIEW IF EXISTS public.view_gst_summary;
DROP VIEW IF EXISTS public.view_dashboard_financial_kpis;

CREATE OR REPLACE VIEW public.view_revenue_summary AS
SELECT
  CURRENT_DATE AS as_of_date,
  ROUND(COALESCE(SUM(CASE WHEN i.status <> 'cancelled' THEN i.total ELSE 0 END), 0), 2) AS accrual_revenue,
  ROUND(COALESCE((SELECT SUM(p.amount) FROM public.payments p WHERE p.reference_type = 'invoice'), 0), 2) AS cash_collection,
  COUNT(*) FILTER (WHERE i.status <> 'cancelled')::integer AS invoice_count
FROM public.invoices i;

CREATE OR REPLACE VIEW public.view_outstanding_summary AS
SELECT
  i.id AS invoice_id,
  i.invoice_number,
  i.order_id,
  i.customer_id,
  COALESCE(c.name, i.customer_name) AS customer_name,
  COALESCE(c.phone, i.phone) AS phone,
  i.created_at::date AS invoice_date,
  i.due_date,
  ROUND(i.total, 2) AS invoice_total,
  ROUND(i.paid_amount, 2) AS paid_amount,
  ROUND(i.balance_amount, 2) AS outstanding_amount,
  (CURRENT_DATE > i.due_date AND i.balance_amount > 0) AS is_overdue,
  GREATEST((CURRENT_DATE - i.due_date), 0) AS days_overdue,
  i.status
FROM public.invoices i
LEFT JOIN public.customers c ON c.id = i.customer_id
WHERE i.status <> 'cancelled';

CREATE OR REPLACE VIEW public.view_aging_buckets AS
SELECT
  CASE
    WHEN vos.outstanding_amount <= 0 THEN 'paid'
    WHEN vos.days_overdue <= 0 THEN 'current'
    WHEN vos.days_overdue BETWEEN 1 AND 30 THEN '1-30'
    WHEN vos.days_overdue BETWEEN 31 AND 60 THEN '31-60'
    WHEN vos.days_overdue BETWEEN 61 AND 90 THEN '61-90'
    ELSE '90+'
  END AS bucket,
  COUNT(*)::integer AS invoice_count,
  ROUND(SUM(vos.outstanding_amount), 2) AS bucket_outstanding
FROM public.view_outstanding_summary vos
GROUP BY 1
ORDER BY 1;

CREATE OR REPLACE VIEW public.view_gst_summary AS
SELECT
  date_trunc('month', i.created_at)::date AS month,
  ROUND(SUM(CASE WHEN i.status <> 'cancelled' THEN i.subtotal ELSE 0 END), 2) AS taxable_subtotal,
  ROUND(SUM(CASE WHEN i.status <> 'cancelled' THEN i.cgst ELSE 0 END), 2) AS cgst_total,
  ROUND(SUM(CASE WHEN i.status <> 'cancelled' THEN i.sgst ELSE 0 END), 2) AS sgst_total,
  ROUND(SUM(CASE WHEN i.status <> 'cancelled' THEN i.igst ELSE 0 END), 2) AS igst_total,
  ROUND(SUM(CASE WHEN i.status <> 'cancelled' THEN i.rounding_adjustment ELSE 0 END), 2) AS rounding_adjustment_total,
  ROUND(SUM(CASE WHEN i.status <> 'cancelled' THEN i.total ELSE 0 END), 2) AS invoice_total
FROM public.invoices i
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW public.view_dashboard_financial_kpis AS
WITH invoice_day AS (
  SELECT
    ROUND(COALESCE(SUM(CASE WHEN i.created_at::date = CURRENT_DATE AND i.status <> 'cancelled' THEN i.total ELSE 0 END), 0), 2) AS today_revenue,
    ROUND(COALESCE(SUM(CASE WHEN i.created_at::date >= (CURRENT_DATE - 30) AND i.status <> 'cancelled' THEN i.total ELSE 0 END), 0), 2) AS last_30d_revenue,
    COUNT(*) FILTER (WHERE i.created_at::date = CURRENT_DATE AND i.status <> 'cancelled')::integer AS today_invoice_count,
    COUNT(*) FILTER (WHERE i.created_at::date >= (CURRENT_DATE - 30) AND i.status <> 'cancelled')::integer AS last_30d_invoice_count,
    ROUND(COALESCE(SUM(CASE WHEN i.status <> 'cancelled' THEN i.balance_amount ELSE 0 END), 0), 2) AS outstanding_total
  FROM public.invoices i
),
pay_day AS (
  SELECT
    ROUND(COALESCE(SUM(CASE WHEN p.reference_type = 'invoice' AND p.payment_date = CURRENT_DATE THEN p.amount ELSE 0 END), 0), 2) AS today_collection,
    ROUND(COALESCE(SUM(CASE WHEN p.reference_type = 'invoice' AND p.payment_date >= (CURRENT_DATE - 30) THEN p.amount ELSE 0 END), 0), 2) AS last_30d_collection
  FROM public.payments p
)
SELECT
  iday.today_revenue,
  iday.last_30d_revenue,
  iday.today_invoice_count,
  iday.last_30d_invoice_count,
  iday.outstanding_total,
  pday.today_collection,
  pday.last_30d_collection
FROM invoice_day iday
CROSS JOIN pay_day pday;

-- Compatibility re-pointing for existing UI routes that already read v_* views.
DROP VIEW IF EXISTS public.v_outstanding_dashboard_summary;
DROP VIEW IF EXISTS public.v_outstanding_aging;
DROP VIEW IF EXISTS public.v_customer_outstanding;
DROP VIEW IF EXISTS public.v_invoice_outstanding;

CREATE OR REPLACE VIEW public.v_invoice_outstanding AS
SELECT
  vos.invoice_id,
  vos.invoice_number,
  vos.order_id,
  vos.customer_id,
  vos.customer_name,
  vos.phone,
  vos.invoice_date,
  vos.due_date,
  vos.invoice_total AS total,
  vos.paid_amount,
  vos.outstanding_amount AS outstanding,
  CASE
    WHEN vos.outstanding_amount <= 0 THEN 'paid'
    WHEN vos.paid_amount > 0 THEN 'partial'
    ELSE 'unpaid'
  END AS payment_status,
  vos.is_overdue,
  vos.days_overdue,
  (
    SELECT MAX(p.payment_date)
    FROM public.payments p
    WHERE p.reference_type = 'invoice'
      AND p.reference_id = vos.invoice_id
  ) AS last_payment_date
FROM public.view_outstanding_summary vos;

CREATE OR REPLACE VIEW public.v_customer_outstanding AS
SELECT
  vio.customer_id,
  vio.customer_name,
  vio.phone,
  COUNT(*)::integer AS total_invoices,
  ROUND(SUM(vio.total), 2) AS total_sales,
  ROUND(SUM(vio.paid_amount), 2) AS total_collected,
  ROUND(SUM(vio.outstanding), 2) AS total_outstanding,
  COUNT(*) FILTER (WHERE vio.payment_status = 'unpaid')::integer AS unpaid_invoices,
  COUNT(*) FILTER (WHERE vio.payment_status = 'partial')::integer AS partial_invoices,
  ROUND(SUM(CASE WHEN vio.is_overdue THEN vio.outstanding ELSE 0 END), 2) AS overdue_outstanding,
  MAX(vio.last_payment_date) AS last_payment_date,
  MAX(vio.invoice_date) AS last_invoice_date
FROM public.v_invoice_outstanding vio
GROUP BY vio.customer_id, vio.customer_name, vio.phone;

CREATE OR REPLACE VIEW public.v_outstanding_aging AS
SELECT
  vos.invoice_id,
  vos.invoice_number,
  vos.customer_id,
  vos.customer_name,
  vos.phone,
  vos.invoice_date,
  vos.due_date,
  vos.invoice_total AS total,
  vos.paid_amount,
  vos.outstanding_amount AS outstanding,
  vos.days_overdue,
  CASE
    WHEN vos.outstanding_amount <= 0 THEN 'paid'
    WHEN vos.days_overdue <= 0 THEN '0-30'
    WHEN vos.days_overdue BETWEEN 1 AND 30 THEN '0-30'
    WHEN vos.days_overdue BETWEEN 31 AND 60 THEN '31-60'
    WHEN vos.days_overdue BETWEEN 61 AND 90 THEN '61-90'
    ELSE '90+'
  END AS aging_bucket
FROM public.view_outstanding_summary vos
WHERE vos.outstanding_amount > 0;

CREATE OR REPLACE VIEW public.v_outstanding_dashboard_summary AS
SELECT
  ROUND(COALESCE(SUM(vos.invoice_total), 0), 2) AS total_sales,
  ROUND(COALESCE(SUM(vos.paid_amount), 0), 2) AS total_collected,
  ROUND(COALESCE(SUM(vos.outstanding_amount), 0), 2) AS total_outstanding,
  ROUND(COALESCE(SUM(CASE WHEN vos.is_overdue THEN vos.outstanding_amount ELSE 0 END), 0), 2) AS overdue_amount,
  (SELECT today_collection FROM public.view_dashboard_financial_kpis) AS today_collection,
  (SELECT last_30d_collection FROM public.view_dashboard_financial_kpis) AS month_collection
FROM public.view_outstanding_summary vos;

-- Replace sales report views so report layer is invoice based, not order-total based.
-- Drop in dependency-safe order: downstream summary views first, then base sales views.
DROP VIEW IF EXISTS public.gst_report_view;
DROP VIEW IF EXISTS public.branch_report_view;
DROP VIEW IF EXISTS public.sales_report_view_school;
DROP VIEW IF EXISTS public.sales_report_view;
DROP VIEW IF EXISTS public.sales_item_report_view;

CREATE OR REPLACE VIEW public.sales_report_view AS
WITH item_agg AS (
  SELECT
    ii.invoice_id,
    STRING_AGG(
      COALESCE(p.name, 'Item') ||
      CASE WHEN pv.size IS NOT NULL AND pv.size <> '' THEN ' (' || pv.size || ')' ELSE '' END ||
      ' x' || ii.quantity,
      ', '
      ORDER BY ii.id
    ) AS items,
    COALESCE(SUM(ii.quantity), 0)::numeric AS total_quantity
  FROM public.invoice_items ii
  LEFT JOIN public.products p ON p.id = ii.product_id
  LEFT JOIN public.product_variants pv ON pv.id = ii.variant_id
  GROUP BY ii.invoice_id
),
latest_payment AS (
  SELECT DISTINCT ON (p.reference_id)
    p.reference_id AS invoice_id,
    upper(COALESCE(p.payment_mode, 'unknown')) AS payment_mode
  FROM public.payments p
  WHERE p.reference_type = 'invoice'
  ORDER BY p.reference_id, p.payment_date DESC, p.created_at DESC
)
SELECT
  i.order_id,
  i.order_id::text AS order_id_text,
  i.created_at::date AS order_date,
  i.created_at AS order_created_at,
  COALESCE(c.name, i.customer_name, 'Unknown Customer') AS customer_name,
  COALESCE(c.phone, i.phone, '') AS phone,
  o.school_id,
  COALESCE(s.name, 'Unassigned School') AS school_name,
  o.branch_id,
  COALESCE(b.name, 'Unassigned Branch') AS branch_name,
  COALESCE(ia.items, '') AS items,
  COALESCE(ia.total_quantity, 0) AS total_quantity,
  ROUND(i.total, 2) AS total_amount,
  upper(COALESCE(i.status, 'issued')) AS status,
  COALESCE(lp.payment_mode, 'UNKNOWN') AS payment_mode,
  (
    i.order_id::text || ' ' ||
    COALESCE(c.name, i.customer_name, '') || ' ' ||
    COALESCE(c.phone, i.phone, '') || ' ' ||
    COALESCE(s.name, '') || ' ' ||
    COALESCE(b.name, '')
  ) AS search_text
FROM public.invoices i
LEFT JOIN public.orders o ON o.id = i.order_id
LEFT JOIN public.customers c ON c.id = i.customer_id
LEFT JOIN public.schools s ON s.id = o.school_id
LEFT JOIN public.branches b ON b.id = o.branch_id
LEFT JOIN item_agg ia ON ia.invoice_id = i.id
LEFT JOIN latest_payment lp ON lp.invoice_id = i.id
WHERE i.status <> 'cancelled';

CREATE OR REPLACE VIEW public.sales_item_report_view AS
WITH latest_payment AS (
  SELECT DISTINCT ON (p.reference_id)
    p.reference_id AS invoice_id,
    upper(COALESCE(p.payment_mode, 'unknown')) AS payment_mode
  FROM public.payments p
  WHERE p.reference_type = 'invoice'
  ORDER BY p.reference_id, p.payment_date DESC, p.created_at DESC
)
SELECT
  i.order_id,
  i.order_id::text AS order_id_text,
  i.created_at::date AS order_date,
  i.created_at AS order_created_at,
  COALESCE(c.name, i.customer_name, 'Unknown Customer') AS customer_name,
  COALESCE(c.phone, i.phone, '') AS phone,
  o.school_id,
  COALESCE(s.name, 'Unassigned School') AS school_name,
  o.branch_id,
  COALESCE(b.name, 'Unassigned Branch') AS branch_name,
  ii.product_id,
  COALESCE(p.name, 'Product') AS product_name,
  ii.variant_id,
  COALESCE(pv.size, 'Default') AS variant_size,
  pv.sku,
  ii.quantity,
  ROUND(ii.unit_price, 2) AS unit_price,
  ROUND(ii.total, 2) AS line_amount,
  upper(COALESCE(i.status, 'issued')) AS status,
  COALESCE(lp.payment_mode, 'UNKNOWN') AS payment_mode,
  0::numeric AS discount_amount,
  ROUND(ii.total, 2) AS revenue_share
FROM public.invoice_items ii
JOIN public.invoices i ON i.id = ii.invoice_id
LEFT JOIN public.orders o ON o.id = i.order_id
LEFT JOIN public.customers c ON c.id = i.customer_id
LEFT JOIN public.schools s ON s.id = o.school_id
LEFT JOIN public.branches b ON b.id = o.branch_id
LEFT JOIN public.products p ON p.id = ii.product_id
LEFT JOIN public.product_variants pv ON pv.id = ii.variant_id
LEFT JOIN latest_payment lp ON lp.invoice_id = i.id
WHERE i.status <> 'cancelled';

-- -----------------------------------------------------------------------------
-- 10) Permissions: prevent direct writes to core financial tables
-- -----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.invoices FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invoice_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ledger_entries FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ledger_entry_lines FROM anon, authenticated;

GRANT SELECT ON public.view_revenue_summary TO authenticated;
GRANT SELECT ON public.view_outstanding_summary TO authenticated;
GRANT SELECT ON public.view_aging_buckets TO authenticated;
GRANT SELECT ON public.view_gst_summary TO authenticated;
GRANT SELECT ON public.view_dashboard_financial_kpis TO authenticated;
GRANT SELECT ON public.sales_report_view TO authenticated;
GRANT SELECT ON public.sales_item_report_view TO authenticated;
GRANT SELECT ON public.v_invoice_outstanding TO authenticated;
GRANT SELECT ON public.v_customer_outstanding TO authenticated;
GRANT SELECT ON public.v_outstanding_aging TO authenticated;
GRANT SELECT ON public.v_outstanding_dashboard_summary TO authenticated;

REVOKE ALL ON public.view_revenue_summary FROM anon;
REVOKE ALL ON public.view_outstanding_summary FROM anon;
REVOKE ALL ON public.view_aging_buckets FROM anon;
REVOKE ALL ON public.view_gst_summary FROM anon;
REVOKE ALL ON public.view_dashboard_financial_kpis FROM anon;

GRANT EXECUTE ON FUNCTION public.record_payment(text, uuid, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_invoice_financials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_balanced_ledger_entry(text, uuid, date, uuid, text, jsonb) TO authenticated;
