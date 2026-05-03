CREATE OR REPLACE FUNCTION public.resolve_current_school_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_school_id uuid;
  v_avatar_url text;
  v_email text;
  v_metadata jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'school_id'
  ) THEN
    EXECUTE 'SELECT school_id FROM public.profiles WHERE id = $1 LIMIT 1'
      INTO v_school_id
      USING v_user_id;
    IF v_school_id IS NOT NULL THEN
      RETURN v_school_id;
    END IF;
  END IF;

  IF to_regclass('public.user_school_map') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT school_id FROM public.user_school_map WHERE user_id = $1 LIMIT 1'
        INTO v_school_id
        USING v_user_id;
      IF v_school_id IS NOT NULL THEN
        RETURN v_school_id;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END IF;

  SELECT avatar_url, email INTO v_avatar_url, v_email
  FROM public.profiles
  WHERE id = v_user_id
  LIMIT 1;

  IF v_avatar_url IS NOT NULL AND v_avatar_url LIKE 'school-assignment:%' THEN
    BEGIN
      v_school_id := nullif(replace(v_avatar_url, 'school-assignment:', ''), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_school_id := NULL;
    END;

    IF v_school_id IS NOT NULL THEN
      RETURN v_school_id;
    END IF;
  END IF;

  BEGIN
    SELECT raw_user_meta_data INTO v_metadata
    FROM auth.users
    WHERE id = v_user_id
    LIMIT 1;

    IF v_metadata ? 'school_id' THEN
      BEGIN
        v_school_id := nullif(v_metadata->>'school_id', '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_school_id := NULL;
      END;
      IF v_school_id IS NOT NULL THEN
        RETURN v_school_id;
      END IF;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  IF v_email IS NOT NULL THEN
    SELECT s.id INTO v_school_id
    FROM public.schools s
    WHERE lower(s.email) = lower(v_email)
    LIMIT 1;

    IF v_school_id IS NOT NULL THEN
      RETURN v_school_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_current_school_id() FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_current_school_id() TO authenticated;
