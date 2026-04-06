-- Single-source store query for /store/:school/:class/:gender
-- Logic:
--   p.school_id = :school_id
--   p.class_id = :class_id
--   LOWER(p.gender) IN (:gender, 'unisex')
--   p.status = 'active'
--   v.status = 'active'

CREATE OR REPLACE FUNCTION public.get_store_class_products(
  p_school_id uuid,
  p_class_id uuid,
  p_gender text
)
RETURNS TABLE (
  id uuid,
  school_id uuid,
  class_id uuid,
  name text,
  category text,
  gender text,
  price numeric,
  base_price numeric,
  description text,
  status text,
  created_at timestamptz,
  product_images jsonb,
  product_variants jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.school_id,
    p.class_id,
    p.name,
    p.category,
    p.gender,
    p.price,
    p.base_price,
    p.description,
    p.status,
    p.created_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pi.id,
            'product_id', pi.product_id,
            'image_url', pi.image_url,
            'storage_path', pi.storage_path,
            'is_primary', pi.is_primary,
            'sort_order', pi.sort_order,
            'created_at', pi.created_at
          )
          ORDER BY pi.is_primary DESC, pi.sort_order ASC
        )
        FROM public.product_images pi
        WHERE pi.product_id = p.id
      ),
      '[]'::jsonb
    ) AS product_images,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'product_id', v.product_id,
            'size', v.size,
            'sku', v.sku,
            'stock', v.stock,
            'base_price', v.base_price,
            'price_override', v.price_override,
            'status', v.status,
            'is_active', v.is_active,
            'created_at', v.created_at
          )
          ORDER BY v.size ASC
        )
        FROM public.product_variants v
        WHERE v.product_id = p.id
          AND v.status = 'active'
      ),
      '[]'::jsonb
    ) AS product_variants
  FROM public.products p
  WHERE p.school_id = p_school_id
    AND p.class_id = p_class_id
    AND lower(COALESCE(p.gender, 'unisex')) IN (lower(COALESCE(p_gender, 'unisex')), 'unisex')
    AND p.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.product_variants v
      WHERE v.product_id = p.id
        AND v.status = 'active'
    )
  ORDER BY p.name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_store_class_products(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_class_products(uuid, uuid, text) TO authenticated;
