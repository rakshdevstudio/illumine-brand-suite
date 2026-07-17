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

    PERFORM set_config('app.bypass_ledger_guard', 'on', true);

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

    PERFORM set_config('app.bypass_ledger_guard', 'on', true);

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
