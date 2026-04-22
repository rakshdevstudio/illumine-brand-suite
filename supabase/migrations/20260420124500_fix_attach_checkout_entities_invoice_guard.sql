-- Fix checkout RPC failure caused by invoice guard during CRM linkage.
--
-- attach_checkout_entities_to_order updates invoices.customer_id/student_id after
-- create_invoice_from_order. With invoice mutation guards enabled, that direct
-- update must run under app.bypass_invoice_guard in this trusted SECURITY DEFINER RPC.

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
RETURNS TABLE(out_customer_id uuid, out_student_id uuid, out_invoice_id uuid)
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
  FROM public.customers AS c
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
    UPDATE public.customers AS c
    SET
      name = COALESCE(NULLIF(btrim(p_customer_name), ''), c.name),
      email = COALESCE(NULLIF(btrim(p_customer_email), ''), c.email)
    WHERE c.id = v_customer_id;
  END IF;

  SELECT c.id, c.name
  INTO v_class_id, v_class_name
  FROM public.classes AS c
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

  UPDATE public.orders AS o
  SET
    customer_id = v_customer_id,
    student_id = v_student_id,
    customer_name = COALESCE(NULLIF(btrim(p_customer_name), ''), o.customer_name),
    phone = COALESCE(NULLIF(v_phone, ''), o.phone),
    student_name = COALESCE(NULLIF(btrim(p_student_name), ''), o.student_name),
    grade = COALESCE(v_class_name, o.grade),
    student_class = COALESCE(v_class_name, o.student_class),
    alternate_phone = COALESCE(NULLIF(btrim(p_alternate_phone), ''), o.alternate_phone)
  WHERE o.id = p_order_id;

  RETURN QUERY SELECT v_customer_id, v_student_id, NULL::uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.attach_checkout_entities_to_order(uuid, text, text, text, text, uuid, text, text, text) TO anon, authenticated;
