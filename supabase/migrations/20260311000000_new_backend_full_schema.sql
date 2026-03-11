-- ============================================================
-- Illumine Brand Suite – Full Schema Migration
-- Target: rkbkorssqydpetilwltc.supabase.co
-- Created: 2026-03-11
-- ============================================================

-- ============================================================
-- 1. ROLE ENUM
-- ============================================================
CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'admin',
  'branch_staff',
  'vendor',
  'school_user',
  'staff'
);

-- ============================================================
-- 2. SCHOOLS
-- ============================================================
CREATE TABLE public.schools (
  id          UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,
  code        TEXT,
  logo_url    TEXT,
  status      TEXT    NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Schools are viewable by everyone"  ON public.schools FOR SELECT USING (true);
CREATE POLICY "Schools can be inserted by anyone" ON public.schools FOR INSERT WITH CHECK (true);
CREATE POLICY "Schools can be updated by anyone"  ON public.schools FOR UPDATE  USING (true);

-- ============================================================
-- 3. CLASSES
-- ============================================================
CREATE TABLE public.classes (
  id          UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   UUID    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  code        TEXT    NOT NULL,
  slug        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT classes_school_slug_unique UNIQUE (school_id, slug)
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Classes are viewable by everyone"  ON public.classes FOR SELECT USING (true);
CREATE POLICY "Classes can be inserted by anyone" ON public.classes FOR INSERT WITH CHECK (true);
CREATE POLICY "Classes can be updated by anyone"  ON public.classes FOR UPDATE  USING (true);

-- ============================================================
-- 4. PRODUCTS
-- ============================================================
CREATE TABLE public.products (
  id          UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   UUID    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id    UUID    REFERENCES public.classes(id),
  name        TEXT    NOT NULL,
  category    TEXT    NOT NULL,
  gender      TEXT    NOT NULL DEFAULT 'Unisex',
  price       NUMERIC NOT NULL,
  image_url   TEXT,
  description TEXT,
  status      TEXT    NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are viewable by everyone"  ON public.products FOR SELECT USING (true);
CREATE POLICY "Products can be inserted by anyone" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Products can be updated by anyone"  ON public.products FOR UPDATE  USING (true);

-- ============================================================
-- 5. PRODUCT VARIANTS
-- ============================================================
CREATE TABLE public.product_variants (
  id             UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id     UUID    NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size           TEXT    NOT NULL,
  sku            TEXT,
  stock          INTEGER NOT NULL DEFAULT 0,
  price_override NUMERIC,
  status         TEXT    NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Variants are viewable by everyone"  ON public.product_variants FOR SELECT USING (true);
CREATE POLICY "Variants can be inserted by anyone" ON public.product_variants FOR INSERT WITH CHECK (true);
CREATE POLICY "Variants can be updated by anyone"  ON public.product_variants FOR UPDATE  USING (true);

-- ============================================================
-- 6. PRODUCT IMAGES
-- ============================================================
CREATE TABLE public.product_images (
  id           UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id   UUID    NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url    TEXT    NOT NULL,
  storage_path TEXT    NOT NULL,
  is_primary   BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Product images are viewable by everyone"  ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Product images can be inserted by anyone" ON public.product_images FOR INSERT WITH CHECK (true);
CREATE POLICY "Product images can be updated by anyone"  ON public.product_images FOR UPDATE  USING (true);
CREATE POLICY "Product images can be deleted by anyone"  ON public.product_images FOR DELETE  USING (true);

-- ============================================================
-- 7. ORDERS
-- ============================================================
CREATE TABLE public.orders (
  id             UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name  TEXT    NOT NULL,
  phone          TEXT    NOT NULL,
  address        TEXT    NOT NULL,
  school_id      UUID    REFERENCES public.schools(id),
  total_amount   NUMERIC NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Orders are viewable by everyone"  ON public.orders FOR SELECT USING (true);
CREATE POLICY "Orders can be inserted by anyone" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Orders can be updated by anyone"  ON public.orders FOR UPDATE  USING (true);

-- ============================================================
-- 8. ORDER ITEMS
-- ============================================================
CREATE TABLE public.order_items (
  id         UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id   UUID    NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID    NOT NULL REFERENCES public.products(id),
  variant_id UUID    NOT NULL REFERENCES public.product_variants(id),
  quantity   INTEGER NOT NULL DEFAULT 1,
  price      NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order items are viewable by everyone"  ON public.order_items FOR SELECT USING (true);
CREATE POLICY "Order items can be inserted by anyone" ON public.order_items FOR INSERT WITH CHECK (true);

-- ============================================================
-- 9. INVENTORY LOGS
-- ============================================================
CREATE TABLE public.inventory_logs (
  id              UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID    NOT NULL REFERENCES public.products(id),
  variant_id      UUID    NOT NULL REFERENCES public.product_variants(id),
  change_type     TEXT    NOT NULL,   -- 'restock' | 'sale' | 'adjustment'
  quantity_change INTEGER NOT NULL,
  previous_stock  INTEGER NOT NULL,
  new_stock       INTEGER NOT NULL,
  order_id        UUID    REFERENCES public.orders(id),
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inventory logs are viewable by everyone"  ON public.inventory_logs FOR SELECT USING (true);
CREATE POLICY "Inventory logs can be inserted by anyone" ON public.inventory_logs FOR INSERT WITH CHECK (true);

-- ============================================================
-- 10. PROFILES  (linked to auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  full_name  TEXT,
  avatar_url TEXT,
  status     TEXT    NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 11. USER ROLES
-- ============================================================
CREATE TABLE public.user_roles (
  id      UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    app_role  NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 12. HELPER FUNCTIONS
-- ============================================================

-- Check if a user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if a user has any admin-level role
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin', 'admin')
  )
$$;

-- Get a user's primary role as text
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 13. ROW-LEVEL SECURITY – PROFILES
-- ============================================================
CREATE POLICY "Profiles viewable by admins or self" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin') OR
    auth.uid() = id
  );

CREATE POLICY "Profiles updatable by admins or self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin') OR
    auth.uid() = id
  );

CREATE POLICY "Profiles insertable" ON public.profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Profiles deletable by super_admin" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- 14. ROW-LEVEL SECURITY – USER ROLES
-- ============================================================
CREATE POLICY "Roles viewable by admins or self" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin') OR
    auth.uid() = user_id
  );

CREATE POLICY "Roles insertable by admins" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Roles updatable by super_admin" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Roles deletable by super_admin" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- 15. STORAGE – product-images bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,  -- 5 MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

CREATE POLICY "Anyone can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Product images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Anyone can update product images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images');

CREATE POLICY "Anyone can delete product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images');
