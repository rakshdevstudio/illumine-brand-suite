-- ============================================================
-- Seed: Super Admin User
-- Email:    admin@illume.com
-- Password: Admin123!
-- ============================================================

DO $$
DECLARE
  new_user_id uuid;
BEGIN

  -- 1. Create the auth user
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    role,
    aud,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    is_super_admin
  )
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'admin@illume.com',
    crypt('Admin123!', gen_salt('bf')),
    now(),                                    -- email pre-confirmed
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Illume Admin"}',
    'authenticated',
    'authenticated',
    now(),
    now(),
    '',
    '',
    false
  )
  RETURNING id INTO new_user_id;

  -- 2. Assign super_admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'super_admin');

  RAISE NOTICE 'Super admin created with id: %', new_user_id;

END $$;
