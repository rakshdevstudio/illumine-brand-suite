-- Fix aggregation fanout in customer outstanding report.
-- Previous join pattern could overcount billed totals and invoice counts when multiple payments exist per invoice.

CREATE OR REPLACE VIEW public.v_customer_outstanding AS
WITH invoice_totals AS (
  SELECT
    i.customer_id,
    count(*) AS invoice_count,
    round(coalesce(sum(i.total), 0), 2) AS billed_total,
    max(i.created_at) AS last_invoice_at
  FROM public.invoices i
  GROUP BY i.customer_id
),
payment_totals AS (
  SELECT
    i.customer_id,
    round(coalesce(sum(ip.amount), 0), 2) AS paid_total
  FROM public.invoices i
  JOIN public.invoice_payments ip ON ip.invoice_id = i.id
  GROUP BY i.customer_id
)
SELECT
  c.id AS customer_id,
  c.name,
  c.phone,
  coalesce(it.invoice_count, 0) AS invoice_count,
  coalesce(it.billed_total, 0) AS billed_total,
  coalesce(pt.paid_total, 0) AS paid_total,
  round(coalesce(it.billed_total, 0) - coalesce(pt.paid_total, 0), 2) AS outstanding_total,
  it.last_invoice_at
FROM public.customers c
LEFT JOIN invoice_totals it ON it.customer_id = c.id
LEFT JOIN payment_totals pt ON pt.customer_id = c.id
ORDER BY outstanding_total DESC, it.last_invoice_at DESC;

GRANT SELECT ON public.v_customer_outstanding TO authenticated;
