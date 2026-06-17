CREATE OR REPLACE FUNCTION public.get_orders_policies()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  res json;
BEGIN
  SELECT json_agg(row_to_json(p)) INTO res
  FROM pg_policies p
  WHERE tablename = 'orders';
  RETURN res;
END;
$$;
