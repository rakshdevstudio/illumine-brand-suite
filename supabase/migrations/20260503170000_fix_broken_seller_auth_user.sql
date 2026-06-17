-- Fix: recreate seeded seller user with complete Auth v2 columns.
-- This resolves GoTrue 500 errors on password grant when older/incomplete auth.users rows exist.

-- Remove potentially broken seeded seller auth user and dependent mappings.
DELETE FROM public.seller_users
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'seller@illume.com');

DELETE FROM public.user_roles
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'seller@illume.com');

DELETE FROM auth.users
WHERE email = 'seller@illume.com';

DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
  target_seller_id uuid;
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
    'seller@illume.com',
    extensions.crypt('Seller123!', extensions.gen_salt('bf')),
    now(),
    NULL,
    '',
    NULL,
    '',
    NULL,
    '',
    '',
    NULL,
    NULL,
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test Seller"}',
    false,
    now(),
    now(),
    NULL,
    NULL,
    '',
    '',
    NULL,
    '',
    0,
    NULL,
    '',
    NULL,
    false,
    NULL,
    false,
    'authenticated',
    'authenticated'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'vendor');

  SELECT id INTO target_seller_id
  FROM public.sellers
  WHERE email = 'seller@illume.com'
  ORDER BY created_at DESC
  LIMIT 1;

  IF target_seller_id IS NULL THEN
    INSERT INTO public.sellers (
      name, email, phone, status, is_active, commission_rate
    ) VALUES (
      'Acme Uniforms', 'seller@illume.com', '9876543210', 'active', true, 15
    ) RETURNING id INTO target_seller_id;
  END IF;

  INSERT INTO public.seller_users (seller_id, user_id, role, status)
  VALUES (target_seller_id, new_user_id, 'owner', 'active')
  ON CONFLICT (seller_id, user_id) DO NOTHING;
END $$;
