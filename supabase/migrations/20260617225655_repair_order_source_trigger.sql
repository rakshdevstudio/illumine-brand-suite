ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS source text,
ADD COLUMN IF NOT EXISTS channel text,
ADD COLUMN IF NOT EXISTS created_from text;

CREATE OR REPLACE FUNCTION public.trg_set_order_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_from = 'pos_app' OR NEW.channel = 'pos' THEN
    IF NEW.source IS NULL THEN
      NEW.source := 'pos';
    END IF;
  END IF;

  IF NEW.source IS NULL THEN
    NEW.source := 'online';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_source ON public.orders;
CREATE TRIGGER trg_set_order_source
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_order_source();
