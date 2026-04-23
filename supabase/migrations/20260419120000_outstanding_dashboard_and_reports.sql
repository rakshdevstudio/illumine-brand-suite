-- Outstanding dashboard/reporting foundation.
-- Core invariant is computed at query time: outstanding = total - paid_amount.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS due_date date;

UPDATE public.invoices
SET due_date = COALESCE(due_date, created_at::date)
WHERE due_date IS NULL;

ALTER TABLE public.invoices
  ALTER COLUMN due_date SET DEFAULT CURRENT_DATE;

ALTER TABLE public.invoices
  ALTER COLUMN due_date SET NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'issued';

-- Re-sync invoice paid and balance values from payment history.
SELECT set_config('app.bypass_invoice_guard', 'on', true);

WITH payment_totals AS (
  SELECT
    ip.invoice_id,
    ROUND(
      COALESCE(SUM(CASE WHEN COALESCE(ip.direction, 'receipt') = 'receipt' THEN ip.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN COALESCE(ip.direction, 'receipt') = 'refund' THEN ip.amount ELSE 0 END), 0),
      2
    ) AS paid_total
  FROM public.invoice_payments ip
  GROUP BY ip.invoice_id
)
UPDATE public.invoices i
SET
  paid_amount = COALESCE(pt.paid_total, 0),
  balance_amount = ROUND(COALESCE(i.total, 0) - COALESCE(pt.paid_total, 0), 2),
  status = CASE
    WHEN COALESCE(i.status, 'issued') = 'cancelled' THEN 'cancelled'
    WHEN ROUND(COALESCE(i.total, 0) - COALESCE(pt.paid_total, 0), 2) <= 0 THEN 'paid'
    WHEN COALESCE(pt.paid_total, 0) > 0 THEN 'partially_paid'
    ELSE 'issued'
  END
FROM payment_totals pt
WHERE pt.invoice_id = i.id;

CREATE INDEX IF NOT EXISTS invoices_due_date_idx
  ON public.invoices (due_date);

CREATE INDEX IF NOT EXISTS invoices_customer_date_idx
  ON public.invoices (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_status_due_date_idx
  ON public.invoices (status, due_date);

CREATE INDEX IF NOT EXISTS payments_reference_date_idx
  ON public.payments (reference_type, reference_id, payment_date DESC);

-- Recreate views explicitly to avoid CREATE OR REPLACE column-rename limitations
-- on existing installations (for example: name -> customer_name).
DROP VIEW IF EXISTS public.v_outstanding_dashboard_summary;
DROP VIEW IF EXISTS public.v_outstanding_aging;
DROP VIEW IF EXISTS public.v_customer_outstanding;
DROP VIEW IF EXISTS public.v_invoice_outstanding;

CREATE OR REPLACE VIEW public.v_invoice_outstanding AS
WITH payment_dates AS (
  SELECT
    p.reference_id AS invoice_id,
    MAX(p.payment_date) AS last_payment_date
  FROM public.payments p
  WHERE p.reference_type = 'invoice'
  GROUP BY p.reference_id
)
SELECT
  i.id AS invoice_id,
  i.invoice_number,
  i.order_id,
  i.customer_id,
  COALESCE(c.name, i.customer_name) AS customer_name,
  COALESCE(c.phone, i.phone) AS phone,
  i.created_at::date AS invoice_date,
  i.due_date,
  ROUND(COALESCE(i.total, 0), 2) AS total,
  ROUND(COALESCE(i.paid_amount, 0), 2) AS paid_amount,
  ROUND(GREATEST(COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0), 0), 2) AS outstanding,
  CASE
    WHEN ROUND(GREATEST(COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0), 0), 2) <= 0 THEN 'paid'
    WHEN ROUND(COALESCE(i.paid_amount, 0), 2) > 0 THEN 'partial'
    ELSE 'unpaid'
  END AS payment_status,
  (i.due_date < CURRENT_DATE AND ROUND(GREATEST(COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0), 0), 2) > 0) AS is_overdue,
  CASE
    WHEN i.due_date < CURRENT_DATE THEN (CURRENT_DATE - i.due_date)
    ELSE 0
  END AS days_overdue,
  pd.last_payment_date
FROM public.invoices i
LEFT JOIN public.customers c ON c.id = i.customer_id
LEFT JOIN payment_dates pd ON pd.invoice_id = i.id
WHERE COALESCE(i.status, 'issued') <> 'cancelled';

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
GROUP BY vio.customer_id, vio.customer_name, vio.phone
ORDER BY total_outstanding DESC, last_invoice_date DESC;

CREATE OR REPLACE VIEW public.v_outstanding_aging AS
SELECT
  vio.invoice_id,
  vio.invoice_number,
  vio.customer_id,
  vio.customer_name,
  vio.phone,
  vio.invoice_date,
  vio.due_date,
  vio.total,
  vio.paid_amount,
  vio.outstanding,
  vio.days_overdue,
  CASE
    WHEN vio.outstanding <= 0 THEN 'paid'
    WHEN vio.due_date >= CURRENT_DATE THEN '0-30'
    WHEN vio.days_overdue BETWEEN 1 AND 30 THEN '0-30'
    WHEN vio.days_overdue BETWEEN 31 AND 60 THEN '31-60'
    WHEN vio.days_overdue BETWEEN 61 AND 90 THEN '61-90'
    ELSE '90+'
  END AS aging_bucket
FROM public.v_invoice_outstanding vio
WHERE vio.outstanding > 0;

CREATE OR REPLACE VIEW public.v_outstanding_dashboard_summary AS
WITH invoice_totals AS (
  SELECT
    ROUND(COALESCE(SUM(vio.total), 0), 2) AS total_sales,
    ROUND(COALESCE(SUM(vio.paid_amount), 0), 2) AS total_collected,
    ROUND(COALESCE(SUM(vio.outstanding), 0), 2) AS total_outstanding,
    ROUND(COALESCE(SUM(CASE WHEN vio.is_overdue THEN vio.outstanding ELSE 0 END), 0), 2) AS overdue_amount
  FROM public.v_invoice_outstanding vio
),
receipt_totals AS (
  SELECT
    ROUND(COALESCE(SUM(CASE WHEN p.reference_type = 'invoice' AND p.payment_date = CURRENT_DATE THEN p.amount ELSE 0 END), 0), 2) AS today_collection,
    ROUND(COALESCE(SUM(CASE WHEN p.reference_type = 'invoice' AND date_trunc('month', p.payment_date::timestamp) = date_trunc('month', CURRENT_DATE::timestamp) THEN p.amount ELSE 0 END), 0), 2) AS month_collection
  FROM public.payments p
)
SELECT
  it.total_sales,
  it.total_collected,
  it.total_outstanding,
  it.overdue_amount,
  rt.today_collection,
  rt.month_collection
FROM invoice_totals it
CROSS JOIN receipt_totals rt;

REVOKE ALL ON public.v_invoice_outstanding FROM anon;
REVOKE ALL ON public.v_customer_outstanding FROM anon;
REVOKE ALL ON public.v_outstanding_aging FROM anon;
REVOKE ALL ON public.v_outstanding_dashboard_summary FROM anon;

GRANT SELECT ON public.v_invoice_outstanding TO authenticated;
GRANT SELECT ON public.v_customer_outstanding TO authenticated;
GRANT SELECT ON public.v_outstanding_aging TO authenticated;
GRANT SELECT ON public.v_outstanding_dashboard_summary TO authenticated;
