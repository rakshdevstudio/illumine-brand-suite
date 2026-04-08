-- Add deleted_at, deleted_by for audit
alter table if exists public.products               add column if not exists deleted_at timestamptz, add column if not exists deleted_by uuid;
alter table if exists public.product_variants       add column if not exists deleted_at timestamptz, add column if not exists deleted_by uuid;
alter table if exists public.school_products        add column if not exists deleted_at timestamptz, add column if not exists deleted_by uuid;
alter table if exists public.school_product_variants add column if not exists deleted_at timestamptz, add column if not exists deleted_by uuid;

-- Ensure defaults
alter table if exists public.products               alter column is_active set default true;
alter table if exists public.product_variants       alter column is_active set default true;
alter table if exists public.school_products        alter column is_active set default true;
alter table if exists public.school_product_variants alter column is_active set default true;

-- Partial indexes for active rows
create index if not exists idx_products_active on public.products (id) where is_active;
create index if not exists idx_product_variants_active on public.product_variants (product_id, is_active);
create index if not exists idx_school_products_active on public.school_products (school_id, product_id) where is_active;
create index if not exists idx_school_product_variants_active on public.school_product_variants (school_id, variant_id) where is_active;

-- RPC: archive_product_cascade
create or replace function public.archive_product_cascade(p_product_id uuid, p_deleted_at timestamptz, p_deleted_by uuid default null)
returns void language plpgsql security definer as $$
begin
  update public.products
    set is_active = false, deleted_at = p_deleted_at, deleted_by = p_deleted_by
  where id = p_product_id;

  update public.product_variants
    set is_active = false, deleted_at = p_deleted_at, deleted_by = p_deleted_by
  where product_id = p_product_id;

  update public.school_products
    set is_active = false, deleted_at = p_deleted_at, deleted_by = p_deleted_by
  where product_id = p_product_id;

  update public.school_product_variants spv
    set is_active = false, deleted_at = p_deleted_at, deleted_by = p_deleted_by
  where spv.variant_id in (select id from public.product_variants where product_id = p_product_id);
end;
$$;

-- RPC: restore_product_cascade
create or replace function public.restore_product_cascade(p_product_id uuid, p_actor uuid default null)
returns void language plpgsql security definer as $$
begin
  update public.products set is_active = true, deleted_at = null, deleted_by = null where id = p_product_id;
  update public.product_variants set is_active = true, deleted_at = null, deleted_by = null where product_id = p_product_id;
  update public.school_products set is_active = true, deleted_at = null, deleted_by = null where product_id = p_product_id;
  update public.school_product_variants spv
    set is_active = true, deleted_at = null, deleted_by = null
  where spv.variant_id in (select id from public.product_variants where product_id = p_product_id);
end;
$$;

-- RPC: hard_delete_product_cascade (protect via RLS / role checks)
create or replace function public.hard_delete_product_cascade(p_product_id uuid, p_actor uuid default null)
returns void language plpgsql security definer as $$
begin
  delete from public.school_product_variants
    where variant_id in (select id from public.product_variants where product_id = p_product_id);

  delete from public.inventory
    where variant_id in (select id from public.product_variants where product_id = p_product_id);

  delete from public.product_variants where product_id = p_product_id;
  delete from public.school_products where product_id = p_product_id;
  delete from public.products where id = p_product_id;
end;
$$;
