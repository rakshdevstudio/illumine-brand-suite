-- Force refresh invoice recompute path to avoid guard-trigger conflicts during checkout.
--
-- Why:
-- `trg_recompute_invoice_from_items` runs when invoice_items are inserted/updated.
-- If an older `recompute_invoice_financials` exists without invoice-guard bypass,
-- checkout fails with: "Direct mutation on invoices is blocked. Use approved RPC functions."
--
-- This patch is idempotent and safe to re-run.

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

  SELECT ROUND(COALESCE(i.paid_amount, 0), 2)
  INTO v_paid
  FROM public.invoices i
  WHERE i.id = p_invoice_id
  FOR UPDATE;

  -- Critical: enable guard bypass before updating invoices from this trusted function.
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
  -- Defensive: set bypass here too so older recompute bodies cannot block checkout.
  PERFORM set_config('app.bypass_invoice_guard', 'on', true);
  PERFORM public.recompute_invoice_financials(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_invoice_from_items ON public.invoice_items;
CREATE TRIGGER trg_recompute_invoice_from_items
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_invoice_from_items();
