CREATE OR REPLACE FUNCTION public.debug_get_triggers()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_agg(row_to_json(t)) FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE c.relname = 'users';
$$;