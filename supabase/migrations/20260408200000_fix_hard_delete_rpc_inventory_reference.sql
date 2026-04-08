-- Fix hard delete RPC to avoid references to deprecated public.inventory table.
-- This function is defensive across schema variants and deletes from tables only if they exist.

create or replace function public.hard_delete_product_cascade(
  p_product_id uuid,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant_ids uuid[];
begin
  select coalesce(array_agg(pv.id), array[]::uuid[])
  into v_variant_ids
  from public.product_variants pv
  where pv.product_id = p_product_id;

  if to_regclass('public.school_product_variants') is not null then
    execute 'delete from public.school_product_variants where variant_id = any($1)' using v_variant_ids;
  end if;

  if to_regclass('public.branch_inventory') is not null then
    execute 'delete from public.branch_inventory where variant_id = any($1)' using v_variant_ids;
  end if;

  if to_regclass('public.inventory_logs') is not null then
    execute 'delete from public.inventory_logs where variant_id = any($1)' using v_variant_ids;
  end if;

  if to_regclass('public.inventory_movements') is not null then
    execute 'delete from public.inventory_movements where variant_id = any($1)' using v_variant_ids;
  end if;

  if to_regclass('public.product_assignments') is not null then
    delete from public.product_assignments where product_id = p_product_id;
  end if;

  if to_regclass('public.school_products') is not null then
    delete from public.school_products where product_id = p_product_id;
  end if;

  delete from public.product_variants
  where product_id = p_product_id;

  delete from public.products
  where id = p_product_id;
end;
$$;

grant execute on function public.hard_delete_product_cascade(uuid, uuid) to authenticated;
