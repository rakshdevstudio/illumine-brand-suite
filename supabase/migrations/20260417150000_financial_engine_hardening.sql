-- Financial engine hardening for Illume ERP.
-- Adds compliance-safe GST regime logic, strict double-entry primitives,
-- payment/refund posting, and reporting views resilient to aggregation fanout.

CREATE OR REPLACE FUNCTION public.is_admin_user()
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
      AND ur.role IN ('super_admin', 'admin')
  );
$$;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS state_code text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS state_code text;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS state_code text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_state_code text;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS seller_state_code text,
  ADD COLUMN IF NOT EXISTS vendor_state_code text,
  ADD COLUMN IF NOT EXISTS is_interstate boolean NOT NULL DEFAULT false;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS igst numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_interstate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seller_state_code text,
  ADD COLUMN IF NOT EXISTS customer_state_code text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'issued',
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS taxable_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'receipt';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_payments_direction_check'
      AND conrelid = 'public.invoice_payments'::regclass
  ) THEN
    ALTER TABLE public.invoice_payments
      ADD CONSTRAINT invoice_payments_direction_check
      CHECK (direction IN ('receipt', 'refund'));
  END IF;
END
$$;

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS txn_date date;

ALTER TABLE public.ledger_entry_lines
  ADD COLUMN IF NOT EXISTS debit numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit numeric(14,2) NOT NULL DEFAULT 0;

UPDATE public.ledger_entries
SET
  reference_type = COALESCE(reference_type, source_type::text),
  reference_id = COALESCE(reference_id, source_id),
  description = COALESCE(description, narration),
  txn_date = COALESCE(txn_date, entry_date)
WHERE reference_type IS NULL
   OR reference_id IS NULL
   OR description IS NULL
   OR txn_date IS NULL;

UPDATE public.ledger_entry_lines
SET
  debit = CASE WHEN side = 'debit' THEN amount ELSE 0 END,
  credit = CASE WHEN side = 'credit' THEN amount ELSE 0 END
WHERE (debit = 0 AND credit = 0)
   OR (debit IS NULL OR credit IS NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ledger_entry_lines_debit_credit_check'
      AND conrelid = 'public.ledger_entry_lines'::regclass
  ) THEN
    ALTER TABLE public.ledger_entry_lines
      ADD CONSTRAINT ledger_entry_lines_debit_credit_check
      CHECK (
        (debit > 0 AND credit = 0)
        OR (credit > 0 AND debit = 0)
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_status_check'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_status_check
      CHECK (status IN ('issued', 'partially_paid', 'paid', 'cancelled'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS invoices_customer_created_idx
  ON public.invoices (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ledger_entries_txn_date_idx
  ON public.ledger_entries (txn_date DESC);

CREATE INDEX IF NOT EXISTS ledger_entries_reference_idx
  ON public.ledger_entries (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS invoice_payments_invoice_date_direction_idx
  ON public.invoice_payments (invoice_id, payment_date DESC, direction);

-- Ensure new invoices start with accurate balance placeholders.
UPDATE public.invoices i
SET
  balance_amount = ROUND(i.total - COALESCE(p.paid_total, 0), 2),
  paid_amount = COALESCE(p.paid_total, 0),
  status = CASE
    WHEN COALESCE(i.status, 'issued') = 'cancelled' THEN 'cancelled'
    WHEN ROUND(i.total - COALESCE(p.paid_total, 0), 2) <= 0 THEN 'paid'
    WHEN COALESCE(p.paid_total, 0) > 0 THEN 'partially_paid'
    ELSE 'issued'
  END
FROM (
  SELECT
    ip.invoice_id,
    ROUND(
      COALESCE(SUM(CASE WHEN ip.direction = 'receipt' THEN ip.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN ip.direction = 'refund' THEN ip.amount ELSE 0 END), 0),
      2
    ) AS paid_total
  FROM public.invoice_payments ip
  GROUP BY ip.invoice_id
) p
WHERE p.invoice_id = i.id;

INSERT INTO public.accounts (code, name, type, is_system)
VALUES
  ('1101', 'Cash in Hand', 'asset', true),
  ('1102', 'Bank Current Account', 'asset', true),
  ('1212', 'Input IGST', 'asset', true),
  ('2101', 'Output CGST Payable', 'liability', true),
  ('2102', 'Output SGST Payable', 'liability', true),
  ('2103', 'Output IGST Payable', 'liability', true),
  ('3101', 'Sales Returns', 'income', true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  is_system = true;

CREATE OR REPLACE FUNCTION public.normalize_state_code(p_state_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_state_code IS NULL OR btrim(p_state_code) = '' THEN NULL
    ELSE UPPER(LEFT(btrim(p_state_code), 2))
  END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_invoice_payment_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(12,2);
  v_current_status text;
  v_paid numeric(12,2);
  v_balance numeric(12,2);
BEGIN
  SELECT i.total, i.status
  INTO v_total, v_current_status
  FROM public.invoices i
  WHERE i.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  SELECT ROUND(
    COALESCE(SUM(CASE WHEN ip.direction = 'receipt' THEN ip.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN ip.direction = 'refund' THEN ip.amount ELSE 0 END), 0),
    2
  )
  INTO v_paid
  FROM public.invoice_payments ip
  WHERE ip.invoice_id = p_invoice_id;

  v_paid := COALESCE(v_paid, 0);
  v_balance := ROUND(v_total - v_paid, 2);

  UPDATE public.invoices i
  SET
    paid_amount = v_paid,
    balance_amount = v_balance,
    status = CASE
      WHEN i.status = 'cancelled' THEN 'cancelled'
      WHEN v_balance <= 0 THEN 'paid'
      WHEN v_paid > 0 THEN 'partially_paid'
      ELSE 'issued'
    END
  WHERE i.id = p_invoice_id;
END;
$$;

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

  SELECT le.id
  INTO v_ledger_id
  FROM public.ledger_entries le
  WHERE le.reference_type = 'invoice'
    AND le.reference_id = v_invoice_id
  LIMIT 1;

  IF v_ledger_id IS NULL THEN
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
  END IF;

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

  IF v_invoice.branch_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve branch for invoice %', p_invoice_id;
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

-- Protect ledger writes from direct non-admin mutation.
REVOKE INSERT, UPDATE, DELETE ON public.ledger_entries FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ledger_entry_lines FROM anon, authenticated;

DROP POLICY IF EXISTS backoffice_insert_ledger_entries ON public.ledger_entries;
DROP POLICY IF EXISTS backoffice_update_ledger_entries ON public.ledger_entries;
DROP POLICY IF EXISTS backoffice_delete_ledger_entries ON public.ledger_entries;
DROP POLICY IF EXISTS backoffice_insert_ledger_entry_lines ON public.ledger_entry_lines;
DROP POLICY IF EXISTS backoffice_update_ledger_entry_lines ON public.ledger_entry_lines;
DROP POLICY IF EXISTS backoffice_delete_ledger_entry_lines ON public.ledger_entry_lines;
DROP POLICY IF EXISTS ledger_entries_admin_insert ON public.ledger_entries;
DROP POLICY IF EXISTS ledger_entries_admin_update ON public.ledger_entries;
DROP POLICY IF EXISTS ledger_entries_admin_delete ON public.ledger_entries;
DROP POLICY IF EXISTS ledger_entry_lines_admin_insert ON public.ledger_entry_lines;
DROP POLICY IF EXISTS ledger_entry_lines_admin_update ON public.ledger_entry_lines;
DROP POLICY IF EXISTS ledger_entry_lines_admin_delete ON public.ledger_entry_lines;

CREATE POLICY ledger_entries_admin_insert
  ON public.ledger_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY ledger_entries_admin_update
  ON public.ledger_entries
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY ledger_entries_admin_delete
  ON public.ledger_entries
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

CREATE POLICY ledger_entry_lines_admin_insert
  ON public.ledger_entry_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY ledger_entry_lines_admin_update
  ON public.ledger_entry_lines
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY ledger_entry_lines_admin_delete
  ON public.ledger_entry_lines
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

CREATE OR REPLACE VIEW public.v_customer_outstanding AS
WITH invoice_totals AS (
  SELECT
    i.customer_id,
    COUNT(*) AS invoice_count,
    ROUND(COALESCE(SUM(i.total), 0), 2) AS billed_total,
    MAX(i.created_at) AS last_invoice_at
  FROM public.invoices i
  GROUP BY i.customer_id
),
payment_totals AS (
  SELECT
    i.customer_id,
    ROUND(
      COALESCE(SUM(CASE WHEN ip.direction = 'receipt' THEN ip.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN ip.direction = 'refund' THEN ip.amount ELSE 0 END), 0),
      2
    ) AS paid_total
  FROM public.invoices i
  JOIN public.invoice_payments ip ON ip.invoice_id = i.id
  GROUP BY i.customer_id
)
SELECT
  c.id AS customer_id,
  c.name,
  c.phone,
  COALESCE(it.invoice_count, 0) AS invoice_count,
  COALESCE(it.billed_total, 0) AS billed_total,
  COALESCE(pt.paid_total, 0) AS paid_total,
  ROUND(COALESCE(it.billed_total, 0) - COALESCE(pt.paid_total, 0), 2) AS outstanding_total,
  it.last_invoice_at
FROM public.customers c
LEFT JOIN invoice_totals it ON it.customer_id = c.id
LEFT JOIN payment_totals pt ON pt.customer_id = c.id
ORDER BY outstanding_total DESC, it.last_invoice_at DESC;

CREATE OR REPLACE VIEW public.v_gst_summary AS
SELECT
  date_trunc('month', report_date)::date AS month,
  ROUND(SUM(output_cgst), 2) AS output_cgst,
  ROUND(SUM(output_sgst), 2) AS output_sgst,
  ROUND(SUM(output_igst), 2) AS output_igst,
  ROUND(SUM(input_cgst), 2) AS input_cgst,
  ROUND(SUM(input_sgst), 2) AS input_sgst,
  ROUND(SUM(input_igst), 2) AS input_igst,
  ROUND(SUM(output_cgst - input_cgst), 2) AS net_cgst_payable,
  ROUND(SUM(output_sgst - input_sgst), 2) AS net_sgst_payable,
  ROUND(SUM(output_igst - input_igst), 2) AS net_igst_payable
FROM (
  SELECT
    i.created_at::date AS report_date,
    i.cgst AS output_cgst,
    i.sgst AS output_sgst,
    i.igst AS output_igst,
    0::numeric AS input_cgst,
    0::numeric AS input_sgst,
    0::numeric AS input_igst
  FROM public.invoices i
  WHERE i.status <> 'cancelled'

  UNION ALL

  SELECT
    p.purchase_date AS report_date,
    0::numeric AS output_cgst,
    0::numeric AS output_sgst,
    0::numeric AS output_igst,
    p.cgst AS input_cgst,
    p.sgst AS input_sgst,
    p.igst AS input_igst
  FROM public.purchases p
  WHERE p.status IN ('confirmed', 'received')
) x
GROUP BY date_trunc('month', report_date)
ORDER BY month DESC;

CREATE OR REPLACE VIEW public.v_sales_summary AS
SELECT
  date_trunc('day', i.created_at)::date AS sales_date,
  COUNT(*) AS invoice_count,
  ROUND(SUM(i.subtotal), 2) AS taxable_sales,
  ROUND(SUM(i.cgst + i.sgst + i.igst), 2) AS gst_collected,
  ROUND(SUM(i.total), 2) AS gross_sales
FROM public.invoices i
WHERE i.status <> 'cancelled'
GROUP BY date_trunc('day', i.created_at)
ORDER BY sales_date DESC;

GRANT SELECT ON public.v_customer_outstanding TO authenticated;
GRANT SELECT ON public.v_gst_summary TO authenticated;
GRANT SELECT ON public.v_sales_summary TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_balanced_ledger_entry(text, uuid, date, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_ledger(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund(uuid, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_with_reversal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_ledger(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_invoice_payment_status(uuid) TO authenticated;
