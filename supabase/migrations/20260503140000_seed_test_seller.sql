DO $$
DECLARE
  new_user_id uuid;
  new_seller_id uuid;
BEGIN
  -- Check if seller user already exists to be safe
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'seller@illume.com') THEN
    RAISE NOTICE 'Test seller already exists.';
    RETURN;
  END IF;

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
      'seller@illume.com',
      crypt('Seller123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Test Seller"}',
      'authenticated',
      'authenticated',
      now(),
      now(),
      '',
      '',
      false
  )
  RETURNING id INTO new_user_id;

  -- 2. Assign vendor role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'vendor');

  -- 3. Create a seller profile
  INSERT INTO public.sellers (
    name, email, phone, status, is_active, commission_rate
  ) VALUES (
    'Acme Uniforms', 'seller@illume.com', '9876543210', 'active', true, 15
  ) RETURNING id INTO new_seller_id;

  -- 4. Map user to seller
  INSERT INTO public.seller_users (
    seller_id, user_id, role, status
  ) VALUES (
    new_seller_id, new_user_id, 'owner', 'active'
  );

  RAISE NOTICE 'Test seller created with email seller@illume.com and password Seller123!';
END $$;