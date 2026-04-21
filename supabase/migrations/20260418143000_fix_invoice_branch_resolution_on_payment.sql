-- Hotfix: allow invoice payment posting when legacy invoices/orders are missing branch linkage.
-- We still prefer order branch, then existing invoice ledger branch, and finally allow NULL
-- because ledger_entries.branch_id is nullable in the current schema.

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

    -- Fallback for legacy invoices/orders where order.branch_id was not persisted.
    IF v_branch_id IS NULL THEN
      SELECT le.branch_id
      INTO v_branch_id
      FROM public.ledger_entries le
      WHERE le.reference_type = 'invoice'
        AND le.reference_id = p_reference_id
        AND le.branch_id IS NOT NULL
      ORDER BY le.created_at ASC
      LIMIT 1;
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

GRANT EXECUTE ON FUNCTION public.record_payment(text, uuid, numeric, text, text, text) TO authenticated;
