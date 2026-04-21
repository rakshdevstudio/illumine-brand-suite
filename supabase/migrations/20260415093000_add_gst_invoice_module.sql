-- GST invoice module for Illume ERP-lite flow.
-- Creates invoices + invoice_items, adds products.gst_percentage,
-- links orders.invoice_id, and auto-generates invoices from successful orders.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gst_percentage numeric NOT NULL DEFAULT 5;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_id uuid;

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  cgst numeric NOT NULL DEFAULT 0,
  sgst numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_order_unique UNIQUE (order_id),
  CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number)
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL,
  gst_percentage numeric NOT NULL,
  cgst_amount numeric NOT NULL,
  sgst_amount numeric NOT NULL,
  total numeric NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_invoice_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_invoice_id_fkey
      FOREIGN KEY (invoice_id)
      REFERENCES public.invoices(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_invoice_id_unique
  ON public.orders (invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices (order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items (invoice_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.invoices TO anon, authenticated;
GRANT SELECT ON public.invoice_items TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoices'
      AND policyname = 'Invoices are viewable by everyone'
  ) THEN
    CREATE POLICY "Invoices are viewable by everyone"
      ON public.invoices
      FOR SELECT
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoice_items'
      AND policyname = 'Invoice items are viewable by everyone'
  ) THEN
    CREATE POLICY "Invoice items are viewable by everyone"
      ON public.invoice_items
      FOR SELECT
      USING (true);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_created_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year text := to_char(p_created_at, 'YYYY');
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('illume-invoice-number-' || v_year));

  SELECT COALESCE(MAX(split_part(invoice_number, '-', 3)::integer), 0) + 1
  INTO v_next
  FROM public.invoices
  WHERE invoice_number LIKE 'ILL-' || v_year || '-%'
    AND invoice_number ~ ('^ILL-' || v_year || '-[0-9]+$');

  RETURN 'ILL-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing_invoice_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item_count integer := 0;
  v_subtotal numeric := 0;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_total numeric := 0;
  v_base numeric;
  v_gst_total numeric;
  v_cgst_line numeric;
  v_sgst_line numeric;
  v_line_total numeric;
  v_address text;
  v_item record;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF upper(COALESCE(v_order.status::text, '')) NOT IN ('PLACED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'PENDING', 'CONFIRMED', 'SHIPPED') THEN
    RETURN NULL;
  END IF;

  SELECT id
  INTO v_existing_invoice_id
  FROM public.invoices
  WHERE order_id = p_order_id
  LIMIT 1;

  IF v_existing_invoice_id IS NOT NULL THEN
    UPDATE public.orders
    SET invoice_id = COALESCE(invoice_id, v_existing_invoice_id)
    WHERE id = p_order_id;

    RETURN v_existing_invoice_id;
  END IF;

  FOR v_item IN
    SELECT
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.price,
      COALESCE(p.gst_percentage, 5) AS gst_percentage
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_item_count := v_item_count + 1;

    v_base := round((COALESCE(v_item.price, 0) * COALESCE(v_item.quantity, 0))::numeric, 2);
    v_gst_total := round((v_base * COALESCE(v_item.gst_percentage, 5) / 100.0)::numeric, 2);
    v_cgst_line := round((v_gst_total / 2.0)::numeric, 2);
    v_sgst_line := round((v_gst_total - v_cgst_line)::numeric, 2);
    v_line_total := round((v_base + v_gst_total)::numeric, 2);

    v_subtotal := round((v_subtotal + v_base)::numeric, 2);
    v_cgst := round((v_cgst + v_cgst_line)::numeric, 2);
    v_sgst := round((v_sgst + v_sgst_line)::numeric, 2);
    v_total := round((v_total + v_line_total)::numeric, 2);
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Cannot create invoice for order % without items', p_order_id;
  END IF;

  v_invoice_number := public.next_invoice_number(COALESCE(v_order.created_at, now()));
  v_address := concat_ws(', ', NULLIF(v_order.address, ''), NULLIF(v_order.city, ''), NULLIF(v_order.pincode, ''));

  INSERT INTO public.invoices (
    order_id,
    invoice_number,
    customer_name,
    phone,
    address,
    subtotal,
    cgst,
    sgst,
    total,
    created_at
  )
  VALUES (
    p_order_id,
    v_invoice_number,
    COALESCE(v_order.customer_name, ''),
    COALESCE(v_order.phone, ''),
    COALESCE(NULLIF(v_address, ''), COALESCE(v_order.address, '')),
    round(v_subtotal, 2),
    round(v_cgst, 2),
    round(v_sgst, 2),
    round(v_total, 2),
    COALESCE(v_order.created_at, now())
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.price,
      COALESCE(p.gst_percentage, 5) AS gst_percentage
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_base := round((COALESCE(v_item.price, 0) * COALESCE(v_item.quantity, 0))::numeric, 2);
    v_gst_total := round((v_base * COALESCE(v_item.gst_percentage, 5) / 100.0)::numeric, 2);
    v_cgst_line := round((v_gst_total / 2.0)::numeric, 2);
    v_sgst_line := round((v_gst_total - v_cgst_line)::numeric, 2);
    v_line_total := round((v_base + v_gst_total)::numeric, 2);

    INSERT INTO public.invoice_items (
      invoice_id,
      product_id,
      variant_id,
      quantity,
      unit_price,
      gst_percentage,
      cgst_amount,
      sgst_amount,
      total
    )
    VALUES (
      v_invoice_id,
      v_item.product_id,
      v_item.variant_id,
      v_item.quantity,
      round(COALESCE(v_item.price, 0)::numeric, 2),
      round(COALESCE(v_item.gst_percentage, 5)::numeric, 2),
      round(v_cgst_line, 2),
      round(v_sgst_line, 2),
      round(v_line_total, 2)
    );
  END LOOP;

  UPDATE public.orders
  SET invoice_id = v_invoice_id
  WHERE id = p_order_id;

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public."createInvoiceFromOrder"(order_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_invoice_from_order(order_id);
$$;

CREATE OR REPLACE FUNCTION public.trg_order_items_create_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_invoice_from_order(NEW.order_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_create_invoice ON public.order_items;
CREATE TRIGGER trg_order_items_create_invoice
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_order_items_create_invoice();

CREATE OR REPLACE FUNCTION public.trg_orders_create_invoice_on_success()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF upper(COALESCE(NEW.status::text, '')) IN ('PLACED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'PENDING', 'CONFIRMED', 'SHIPPED')
      AND upper(COALESCE(OLD.status::text, '')) NOT IN ('PLACED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'PENDING', 'CONFIRMED', 'SHIPPED') THEN
    PERFORM public.create_invoice_from_order(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_create_invoice_on_success ON public.orders;
CREATE TRIGGER trg_orders_create_invoice_on_success
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_create_invoice_on_success();
