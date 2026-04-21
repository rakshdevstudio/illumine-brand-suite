-- Public storefront checkout inventory reservation.
-- Wraps the admin inventory movement RPC in a SECURITY DEFINER function so
-- anonymous storefront checkout can reserve stock without granting broad access
-- to apply_inventory_movement directly.

CREATE OR REPLACE FUNCTION public.reserve_checkout_inventory_movement(
  p_branch_id uuid,
  p_variant_id uuid,
  p_type text,
  p_quantity integer,
  p_reference_type text DEFAULT 'ORDER',
  p_reference_id uuid DEFAULT null,
  p_reason text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_branch_id IS NULL OR p_variant_id IS NULL THEN
    RAISE EXCEPTION 'branch_id and variant_id are required';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be > 0';
  END IF;

  IF lower(COALESCE(p_reference_type, '')) <> 'order' THEN
    RAISE EXCEPTION 'checkout inventory reservations must use ORDER reference type';
  END IF;

  SELECT public.apply_inventory_movement(
    p_branch_id,
    p_variant_id,
    p_type,
    p_quantity,
    p_reference_type,
    p_reference_id,
    p_reason,
    auth.uid()
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_checkout_inventory_movement(uuid, uuid, text, integer, text, uuid, text) TO anon, authenticated;