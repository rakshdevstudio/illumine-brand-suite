-- Phase 1: Seller Payout generation RPC
ALTER TABLE public.seller_order_items
ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES public.seller_payouts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.generate_seller_payout(
  p_seller_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS public.seller_payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_number text;
  v_gross_sales numeric(12,2) := 0;
  v_commission numeric(12,2) := 0;
  v_net_payable numeric(12,2) := 0;
  v_payout public.seller_payouts;
  v_count integer;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Verify items exist to pay out
  SELECT COUNT(*)
  INTO v_count
  FROM public.seller_order_items soi
  JOIN public.orders o ON o.id = soi.order_id
  JOIN public.invoices i ON i.id = o.invoice_id
  WHERE soi.seller_id = p_seller_id
    AND soi.payout_id IS NULL
    AND soi.fulfillment_status IN ('delivered', 'completed')
    AND i.status = 'paid'
    AND DATE(o.created_at) >= p_period_start
    AND DATE(o.created_at) <= p_period_end;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No eligible items found for this seller and period.';
  END IF;

  -- Calculate totals
  SELECT 
    COALESCE(SUM(soi.gross_amount), 0),
    COALESCE(SUM(soi.commission_amount), 0),
    COALESCE(SUM(soi.net_amount), 0)
  INTO v_gross_sales, v_commission, v_net_payable
  FROM public.seller_order_items soi
  JOIN public.orders o ON o.id = soi.order_id
  JOIN public.invoices i ON i.id = o.invoice_id
  WHERE soi.seller_id = p_seller_id
    AND soi.payout_id IS NULL
    AND soi.fulfillment_status IN ('delivered', 'completed')
    AND i.status = 'paid'
    AND DATE(o.created_at) >= p_period_start
    AND DATE(o.created_at) <= p_period_end;

  v_payout_number := 'PO-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 4));

  INSERT INTO public.seller_payouts (
    seller_id, payout_number, status, period_start, period_end,
    gross_sales, commission_amount, net_payable,
    created_at, updated_at
  )
  VALUES (
    p_seller_id, v_payout_number, 'pending', p_period_start, p_period_end,
    v_gross_sales, v_commission, v_net_payable,
    now(), now()
  )
  RETURNING * INTO v_payout;

  UPDATE public.seller_order_items soi
  SET payout_id = v_payout.id, updated_at = now()
  FROM public.orders o, public.invoices i
  WHERE o.id = soi.order_id AND i.id = o.invoice_id
    AND soi.seller_id = p_seller_id
    AND soi.payout_id IS NULL
    AND soi.fulfillment_status IN ('delivered', 'completed')
    AND i.status = 'paid'
    AND DATE(o.created_at) >= p_period_start
    AND DATE(o.created_at) <= p_period_end;

  INSERT INTO public.seller_logs (seller_id, actor_id, action, entity_type, entity_id, new_values)
  VALUES (p_seller_id, auth.uid(), 'payout_generated', 'seller_payout', v_payout.id, to_jsonb(v_payout));

  RETURN v_payout;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_seller_payout(uuid, date, date) TO authenticated;
