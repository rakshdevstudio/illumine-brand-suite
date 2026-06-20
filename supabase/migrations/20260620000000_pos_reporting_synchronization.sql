-- ===========================================================================
-- POS Reporting Synchronization Fix
-- ===========================================================================
-- Shifts sales analytics logic to aggregate revenue directly from `orders`
-- instead of `invoices`, ensuring immediate POS sales (which do not create
-- invoices) are included in dashboard revenue and sales reports.
--
-- Inclusion Logic:
--   For POS: source IN ('pos','offline_pos') AND status != cancelled
--   For ecommerce: status != cancelled AND invoice exists
--
-- Excluded: Invoice count, outstanding, collections (these remain tied to invoices)
-- ===========================================================================

-- 1. Update view_dashboard_financial_kpis
CREATE OR REPLACE VIEW public.view_dashboard_financial_kpis AS
WITH order_day AS (
  SELECT
    ROUND(COALESCE(SUM(CASE WHEN o.created_at::date = CURRENT_DATE THEN o.total_amount ELSE 0 END), 0), 2) AS today_revenue,
    ROUND(COALESCE(SUM(CASE WHEN o.created_at::date >= (CURRENT_DATE - 30) THEN o.total_amount ELSE 0 END), 0), 2) AS last_30d_revenue
  FROM public.orders o
  LEFT JOIN public.invoices i ON i.order_id = o.id
  WHERE upper(COALESCE(o.status::text, '')) <> 'CANCELLED'
    AND (
      lower(COALESCE(o.source, '')) IN ('pos', 'offline_pos')
      OR i.id IS NOT NULL
    )
),
invoice_day AS (
  SELECT
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
  oday.today_revenue,
  oday.last_30d_revenue,
  iday.today_invoice_count,
  iday.last_30d_invoice_count,
  iday.outstanding_total,
  pday.today_collection,
  pday.last_30d_collection
FROM order_day oday
CROSS JOIN invoice_day iday
CROSS JOIN pay_day pday;

-- 2. Update sales_report_view
CREATE OR REPLACE VIEW public.sales_report_view AS
WITH item_agg AS (
  SELECT
    oi.order_id,
    STRING_AGG(
      COALESCE(p.name, 'Item') ||
      CASE WHEN pv.size IS NOT NULL AND pv.size <> '' THEN ' (' || pv.size || ')' ELSE '' END ||
      ' x' || oi.quantity,
      ', '
      ORDER BY oi.id
    ) AS items,
    COALESCE(SUM(oi.quantity), 0)::numeric AS total_quantity
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id
  LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
  GROUP BY oi.order_id
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
  o.id AS order_id,
  o.id::text AS order_id_text,
  o.created_at::date AS order_date,
  o.created_at AS order_created_at,
  COALESCE(c.name, o.customer_name, 'Unknown Customer') AS customer_name,
  COALESCE(c.phone, o.phone, '') AS phone,
  o.school_id,
  COALESCE(s.name, 'Unassigned School') AS school_name,
  o.branch_id,
  COALESCE(b.name, 'Unassigned Branch') AS branch_name,
  COALESCE(ia.items, '') AS items,
  COALESCE(ia.total_quantity, 0) AS total_quantity,
  ROUND(o.total_amount, 2) AS total_amount,
  upper(COALESCE(o.status::text, 'placed')) AS status,
  CASE 
    WHEN lower(COALESCE(o.source, '')) IN ('pos', 'offline_pos') THEN upper(COALESCE(o.payment_mode, 'UNKNOWN'))
    ELSE COALESCE(lp.payment_mode, 'UNKNOWN')
  END AS payment_mode,
  (
    o.id::text || ' ' ||
    COALESCE(c.name, o.customer_name, '') || ' ' ||
    COALESCE(c.phone, o.phone, '') || ' ' ||
    COALESCE(s.name, '') || ' ' ||
    COALESCE(b.name, '')
  ) AS search_text
FROM public.orders o
LEFT JOIN public.invoices i ON i.order_id = o.id
LEFT JOIN public.customers c ON c.id = i.customer_id
LEFT JOIN public.schools s ON s.id = o.school_id
LEFT JOIN public.branches b ON b.id = o.branch_id
LEFT JOIN item_agg ia ON ia.order_id = o.id
LEFT JOIN latest_payment lp ON lp.invoice_id = i.id
WHERE upper(COALESCE(o.status::text, '')) <> 'CANCELLED'
  AND (
    lower(COALESCE(o.source, '')) IN ('pos', 'offline_pos')
    OR i.id IS NOT NULL
  );

-- 3. Update sales_item_report_view
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
  o.id AS order_id,
  o.id::text AS order_id_text,
  o.created_at::date AS order_date,
  o.created_at AS order_created_at,
  COALESCE(c.name, o.customer_name, 'Unknown Customer') AS customer_name,
  COALESCE(c.phone, o.phone, '') AS phone,
  o.school_id,
  COALESCE(s.name, 'Unassigned School') AS school_name,
  o.branch_id,
  COALESCE(b.name, 'Unassigned Branch') AS branch_name,
  oi.product_id,
  COALESCE(p.name, 'Product') AS product_name,
  oi.variant_id,
  COALESCE(pv.size, 'Default') AS variant_size,
  pv.sku,
  oi.quantity,
  ROUND(oi.price, 2) AS unit_price,
  ROUND(oi.quantity * oi.price, 2) AS line_amount,
  upper(COALESCE(o.status::text, 'placed')) AS status,
  CASE 
    WHEN lower(COALESCE(o.source, '')) IN ('pos', 'offline_pos') THEN upper(COALESCE(o.payment_mode, 'UNKNOWN'))
    ELSE COALESCE(lp.payment_mode, 'UNKNOWN')
  END AS payment_mode,
  0::numeric AS discount_amount,
  ROUND(oi.quantity * oi.price, 2) AS revenue_share
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN public.invoices i ON i.order_id = o.id
LEFT JOIN public.customers c ON c.id = i.customer_id
LEFT JOIN public.schools s ON s.id = o.school_id
LEFT JOIN public.branches b ON b.id = o.branch_id
LEFT JOIN public.products p ON p.id = oi.product_id
LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
LEFT JOIN latest_payment lp ON lp.invoice_id = i.id
WHERE upper(COALESCE(o.status::text, '')) <> 'CANCELLED'
  AND (
    lower(COALESCE(o.source, '')) IN ('pos', 'offline_pos')
    OR i.id IS NOT NULL
  );

-- 4. Re-grant permissions
GRANT SELECT ON public.view_dashboard_financial_kpis TO authenticated;
GRANT SELECT ON public.sales_report_view TO authenticated;
GRANT SELECT ON public.sales_item_report_view TO authenticated;
REVOKE ALL ON public.view_dashboard_financial_kpis FROM anon;
