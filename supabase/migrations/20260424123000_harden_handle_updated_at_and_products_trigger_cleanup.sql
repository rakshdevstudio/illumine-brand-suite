-- Harden updated_at trigger helper so it only touches rows that actually have updated_at.
-- This prevents runtime errors like: record "new" has no field "updated_at".
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_jsonb(NEW) ? 'updated_at' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
  END IF;

  RETURN NEW;
END;
$$;

-- Cleanup: if any historical/manual trigger on products uses handle_updated_at,
-- drop it because products does not have an updated_at column.
DO $$
DECLARE
  trigger_rec RECORD;
BEGIN
  FOR trigger_rec IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND c.relname = 'products'
      AND pn.nspname = 'public'
      AND p.proname = 'handle_updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.products', trigger_rec.tgname);
  END LOOP;
END;
$$;
