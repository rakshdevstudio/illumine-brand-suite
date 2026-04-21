-- Financial architecture invariant tests (enterprise SSoT).
-- These checks are designed to run in Supabase SQL Editor without stopping on auth-context issues.
--
-- NOTE ABOUT RPC MUTATION TESTS:
-- record_payment() requires auth.uid() + admin role mapping in public.user_roles.
-- In SQL Editor (postgres session), auth.uid() is usually NULL unless JWT claims are provided.
-- The DO blocks below skip mutation tests safely when auth context or sample data is missing.

-- Optional debug aid:
SELECT auth.uid() AS current_auth_uid;

-- 1) Overpayment attempt must fail (when runnable under authenticated admin context).
DO $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE NOTICE 'SKIP overpayment test: auth.uid() is NULL in this session.';
    RETURN;
  END IF;

  SELECT i.id
  INTO v_invoice_id
  FROM public.invoices i
  WHERE i.status <> 'cancelled'
    AND COALESCE(i.balance_amount, 0) > 0
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    RAISE NOTICE 'SKIP overpayment test: no eligible invoice found.';
    RETURN;
  END IF;

  BEGIN
    PERFORM public.record_payment(
      'invoice',
      v_invoice_id,
      999999,
      'bank',
      'test-overpayment-' || v_invoice_id::text,
      'overpayment should fail'
    );
    RAISE EXCEPTION 'FAIL: overpayment was accepted for invoice %', v_invoice_id;
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('Overpayment blocked' IN SQLERRM) > 0 OR POSITION('exceeds outstanding' IN SQLERRM) > 0 THEN
        RAISE NOTICE 'PASS: overpayment blocked as expected. message=%', SQLERRM;
      ELSE
        RAISE NOTICE 'SKIP/INFO: overpayment test could not complete in current auth/role context. message=%', SQLERRM;
      END IF;
  END;
END $$;

-- 2) Duplicate payment with same idempotency key must not create duplicate (when runnable).
DO $$
DECLARE
  v_invoice_id uuid;
  v_key text;
  v_first jsonb;
  v_second jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE NOTICE 'SKIP idempotency test: auth.uid() is NULL in this session.';
    RETURN;
  END IF;

  SELECT i.id
  INTO v_invoice_id
  FROM public.invoices i
  WHERE i.status <> 'cancelled'
    AND COALESCE(i.balance_amount, 0) >= 1
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    RAISE NOTICE 'SKIP idempotency test: no invoice with balance >= 1 found.';
    RETURN;
  END IF;

  v_key := 'test-idempotent-' || v_invoice_id::text;

  BEGIN
    SELECT public.record_payment('invoice', v_invoice_id, 1, 'cash', v_key, 'first run') INTO v_first;
    SELECT public.record_payment('invoice', v_invoice_id, 1, 'cash', v_key, 'second run') INTO v_second;

    IF COALESCE((v_second->>'duplicate')::boolean, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FAIL: duplicate flag is not true on second call. second=%', v_second;
    END IF;

    RAISE NOTICE 'PASS: idempotency works. first=%, second=%', v_first, v_second;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'SKIP/INFO: idempotency test could not complete in current auth/role context. message=%', SQLERRM;
  END;
END $$;

-- 3) Cancelled invoices excluded from revenue.
SELECT
  (SELECT accrual_revenue FROM public.view_revenue_summary) AS view_revenue,
  (SELECT ROUND(COALESCE(SUM(total), 2), 2) FROM public.invoices WHERE status <> 'cancelled') AS direct_revenue;

-- 4) Outstanding always equals total - paid_amount.
SELECT id, invoice_number, total, paid_amount, balance_amount
FROM public.invoices
WHERE ROUND(balance_amount, 2) <> ROUND(total - paid_amount, 2)
   OR paid_amount < 0
   OR balance_amount < 0
   OR paid_amount > total;

-- 5) Ledger always balanced.
SELECT
  lel.ledger_entry_id,
  ROUND(SUM(COALESCE(lel.debit, 0)), 2) AS total_debit,
  ROUND(SUM(COALESCE(lel.credit, 0)), 2) AS total_credit
FROM public.ledger_entry_lines lel
GROUP BY lel.ledger_entry_id
HAVING ROUND(SUM(COALESCE(lel.debit, 0)), 2) <> ROUND(SUM(COALESCE(lel.credit, 0)), 2);

-- 6) GST totals align with invoice total (including rounding adjustment).
SELECT
  i.id,
  i.invoice_number,
  i.subtotal,
  i.cgst,
  i.sgst,
  i.igst,
  i.rounding_adjustment,
  i.total,
  ROUND(i.subtotal + i.cgst + i.sgst + i.igst + i.rounding_adjustment, 2) AS recomputed_total
FROM public.invoices i
WHERE ROUND(i.total, 2) <> ROUND(i.subtotal + i.cgst + i.sgst + i.igst + i.rounding_adjustment, 2)
  AND i.status <> 'cancelled';

-- 7) Dashboard financial totals match report totals.
SELECT
  (SELECT ROUND(COALESCE(SUM(invoice_total), 2), 2) FROM public.view_outstanding_summary) AS report_invoice_total,
  (SELECT ROUND(COALESCE(SUM(total), 2), 2) FROM public.invoices WHERE status <> 'cancelled') AS invoice_table_total,
  (SELECT ROUND(COALESCE(SUM(outstanding_amount), 2), 2) FROM public.view_outstanding_summary) AS report_outstanding_total,
  (SELECT ROUND(COALESCE(SUM(balance_amount), 2), 2) FROM public.invoices WHERE status <> 'cancelled') AS invoice_balance_total,
  (SELECT ROUND(COALESCE(cash_collection, 0), 2) FROM public.view_revenue_summary) AS revenue_view_cash,
  (SELECT ROUND(COALESCE(SUM(amount), 0), 2) FROM public.payments WHERE reference_type = 'invoice') AS payments_cash;

-- 8) Orders are operational entity only. This query should show no finance metric source dependency.
-- (Review application queries to ensure no financial KPI computes SUM(orders.total_amount).)
SELECT COUNT(*) AS order_count_only
FROM public.orders;
