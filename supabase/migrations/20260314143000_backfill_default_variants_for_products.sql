INSERT INTO public.product_variants (
  product_id,
  size,
  stock,
  price_override,
  low_stock_threshold
)
SELECT
  p.id,
  'default',
  0,
  NULL,
  5
FROM public.products p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.product_variants pv
  WHERE pv.product_id = p.id
);
