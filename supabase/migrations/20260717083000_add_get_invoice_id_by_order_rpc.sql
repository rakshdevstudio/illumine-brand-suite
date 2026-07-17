-- Migration: 20260717083000_add_get_invoice_id_by_order_rpc.sql

CREATE OR REPLACE FUNCTION public.get_invoice_id_by_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  SELECT id INTO v_invoice_id
  FROM public.invoices
  WHERE order_id = p_order_id
  LIMIT 1;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_id_by_order(uuid) TO anon, authenticated;
