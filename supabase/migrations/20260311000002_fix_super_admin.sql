-- ============================================================
-- Fix: Delete broken admin user and recreate with all
--      required Supabase Auth v2 columns
-- ============================================================

-- Step 1: Remove the broken user entirely (cascades to profiles + user_roles)
DELETE FROM auth.users WHERE email = 'admin@illume.com';

-- Step 2: Recreate with all required Auth v2 fields
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN

  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at,
    is_anonymous,
    role,
    aud
  )
  VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'admin@illume.com',
    crypt('Admin123!', gen_salt('bf')),
    now(),           -- email pre-confirmed
    NULL,            -- invited_at
    '',              -- confirmation_token
    NULL,            -- confirmation_sent_at
    '',              -- recovery_token
    NULL,            -- recovery_sent_at
    '',              -- email_change_token_new
    '',              -- email_change
    NULL,            -- email_change_sent_at
    NULL,            -- last_sign_in_at
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Illume Admin"}',
    false,           -- is_super_admin
    now(),
    now(),
    NULL,            -- phone
    NULL,            -- phone_confirmed_at
    '',              -- phone_change
    '',              -- phone_change_token
    NULL,            -- phone_change_sent_at
    '',              -- email_change_token_current
    0,               -- email_change_confirm_status
    NULL,            -- banned_until
    '',              -- reauthentication_token
    NULL,            -- reauthentication_sent_at
    false,           -- is_sso_user
    NULL,            -- deleted_at
    false,           -- is_anonymous
    'authenticated',
    'authenticated'
  );

  -- Assign super_admin role
  -- (handle_new_user trigger creates the profile automatically)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'super_admin');

  RAISE NOTICE 'Admin recreated with id: %', new_user_id;

END $$;

-- Verify
SELECT u.email, p.full_name, p.status, r.role
FROM auth.users u
JOIN public.profiles p  ON p.id = u.id
JOIN public.user_roles r ON r.user_id = u.id
WHERE u.email = 'admin@illume.com';
