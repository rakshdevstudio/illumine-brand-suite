-- Customer + Student CRM foundation for Illume
-- Adds a scalable parent-student model and links to orders/invoices.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_id_fkey'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers DROP CONSTRAINT customers_id_fkey;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END
$$;

ALTER TABLE public.customers
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Keep legacy columns for backward compatibility, but enforce unique non-empty phone values for CRM records.
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique_idx
  ON public.customers ((regexp_replace(COALESCE(phone, ''), '\\D', '', 'g')))
  WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') <> '';

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_normalized text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  gender text NOT NULL CHECK (gender IN ('Male', 'Female', 'Unisex')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS students_customer_identity_unique
  ON public.students (customer_id, name_normalized, school_id, class_id, gender);

CREATE INDEX IF NOT EXISTS students_customer_id_idx ON public.students(customer_id);
CREATE INDEX IF NOT EXISTS students_school_class_gender_idx ON public.students(school_id, class_id, gender);
CREATE INDEX IF NOT EXISTS students_created_at_idx ON public.students(created_at DESC);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_student_id_idx ON public.orders(student_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS invoices_student_id_idx ON public.invoices(student_id);

UPDATE public.invoices i
SET
  customer_id = o.customer_id,
  student_id = o.student_id
FROM public.orders o
WHERE o.id = i.order_id
  AND (i.customer_id IS DISTINCT FROM o.customer_id OR i.student_id IS DISTINCT FROM o.student_id);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customers'
      AND policyname = 'admins_read_all_customers'
  ) THEN
    CREATE POLICY "admins_read_all_customers"
      ON public.customers
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('super_admin', 'admin', 'staff', 'branch_staff')
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'students'
      AND policyname = 'students_admin_read_all'
  ) THEN
    CREATE POLICY "students_admin_read_all"
      ON public.students
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('super_admin', 'admin', 'staff', 'branch_staff')
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'students'
      AND policyname = 'students_admin_write'
  ) THEN
    CREATE POLICY "students_admin_write"
      ON public.students
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('super_admin', 'admin', 'staff', 'branch_staff')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('super_admin', 'admin', 'staff', 'branch_staff')
        )
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.find_checkout_customer_by_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := regexp_replace(COALESCE(p_phone, ''), '\\D', '', 'g');
  v_customer record;
  v_result jsonb;
BEGIN
  IF v_phone = '' THEN
    RETURN NULL;
  END IF;

  SELECT c.id, c.name, c.phone, c.email
  INTO v_customer
  FROM public.customers c
  WHERE regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = v_phone
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'customer_id', v_customer.id,
    'name', v_customer.name,
    'phone', v_customer.phone,
    'email', v_customer.email,
    'students', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'school_id', s.school_id,
          'school_name', sch.name,
          'class_id', s.class_id,
          'class_name', cls.name,
          'gender', s.gender,
          'created_at', s.created_at
        )
        ORDER BY s.created_at DESC
      ) FILTER (WHERE s.id IS NOT NULL),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM public.students s
  LEFT JOIN public.schools sch ON sch.id = s.school_id
  LEFT JOIN public.classes cls ON cls.id = s.class_id
  WHERE s.customer_id = v_customer.id;

  IF v_result IS NULL THEN
    v_result := jsonb_build_object(
      'customer_id', v_customer.id,
      'name', v_customer.name,
      'phone', v_customer.phone,
      'email', v_customer.email,
      'students', '[]'::jsonb
    );
  END IF;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.attach_checkout_entities_to_order(uuid, text, text, text, text, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.attach_checkout_entities_to_order(
  p_order_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_student_name text,
  p_school_id uuid,
  p_class_name text,
  p_gender text,
  p_alternate_phone text DEFAULT NULL
)
RETURNS TABLE(customer_id uuid, student_id uuid, invoice_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := regexp_replace(COALESCE(p_customer_phone, ''), '\\D', '', 'g');
  v_gender text;
  v_customer_id uuid;
  v_student_id uuid;
  v_invoice_id uuid;
  v_class_id uuid;
  v_class_name text;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order id is required';
  END IF;

  IF v_phone = '' THEN
    RAISE EXCEPTION 'Customer phone is required';
  END IF;

  IF COALESCE(btrim(p_student_name), '') = '' THEN
    RAISE EXCEPTION 'Student name is required';
  END IF;

  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'School id is required';
  END IF;

  SELECT c.id
  INTO v_customer_id
  FROM public.customers c
  WHERE regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = v_phone
  ORDER BY c.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone, email)
    VALUES (
      NULLIF(btrim(p_customer_name), ''),
      v_phone,
      NULLIF(btrim(p_customer_email), '')
    )
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers
    SET
      name = COALESCE(NULLIF(btrim(p_customer_name), ''), name),
      email = COALESCE(NULLIF(btrim(p_customer_email), ''), email)
    WHERE id = v_customer_id;
  END IF;

  SELECT c.id, c.name
  INTO v_class_id, v_class_name
  FROM public.classes c
  WHERE c.school_id = p_school_id
    AND lower(c.name) = lower(COALESCE(btrim(p_class_name), ''))
  ORDER BY c.sort_order ASC
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Class "%" not found for selected school', p_class_name;
  END IF;

  v_gender :=
    CASE lower(COALESCE(p_gender, ''))
      WHEN 'male' THEN 'Male'
      WHEN 'boy' THEN 'Male'
      WHEN 'boys' THEN 'Male'
      WHEN 'female' THEN 'Female'
      WHEN 'girl' THEN 'Female'
      WHEN 'girls' THEN 'Female'
      ELSE 'Unisex'
    END;

  INSERT INTO public.students (customer_id, name, school_id, class_id, gender)
  VALUES (
    v_customer_id,
    btrim(p_student_name),
    p_school_id,
    v_class_id,
    v_gender
  )
  ON CONFLICT (customer_id, name_normalized, school_id, class_id, gender)
  DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_student_id;

  UPDATE public.orders
  SET
    customer_id = v_customer_id,
    student_id = v_student_id,
    customer_name = COALESCE(NULLIF(btrim(p_customer_name), ''), customer_name),
    phone = COALESCE(NULLIF(v_phone, ''), phone),
    student_name = COALESCE(NULLIF(btrim(p_student_name), ''), student_name),
    grade = COALESCE(v_class_name, grade),
    student_class = COALESCE(v_class_name, student_class),
    alternate_phone = COALESCE(NULLIF(btrim(p_alternate_phone), ''), alternate_phone)
  WHERE id = p_order_id;

  v_invoice_id := public.create_invoice_from_order(p_order_id);

  IF v_invoice_id IS NOT NULL THEN
    UPDATE public.invoices
    SET
      customer_id = v_customer_id,
      student_id = v_student_id
    WHERE id = v_invoice_id;
  END IF;

  RETURN QUERY SELECT v_customer_id, v_student_id, v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_checkout_customer_by_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_checkout_entities_to_order(uuid, text, text, text, text, uuid, text, text, text) TO anon, authenticated;

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

    UPDATE public.invoices
    SET
      customer_id = COALESCE(customer_id, v_order.customer_id),
      student_id = COALESCE(student_id, v_order.student_id)
    WHERE id = v_existing_invoice_id;

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
    customer_id,
    student_id,
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
    v_order.customer_id,
    v_order.student_id,
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
    ) VALUES (
      v_invoice_id,
      v_item.product_id,
      v_item.variant_id,
      COALESCE(v_item.quantity, 0),
      round(COALESCE(v_item.price, 0), 2),
      round(COALESCE(v_item.gst_percentage, 5), 2),
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
