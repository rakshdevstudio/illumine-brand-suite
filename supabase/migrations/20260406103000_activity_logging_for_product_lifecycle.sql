-- Add activity logging inside product lifecycle RPCs. Safe even if activity_logs already populated.

-- Helper: lightweight log insert
create or replace function public.log_product_activity(
  p_action text,
  p_entity_id uuid,
  p_entity_type text,
  p_description text,
  p_actor uuid default null
) returns void language plpgsql as $$
begin
  insert into public.activity_logs(action_type, entity_id, entity_type, description, performed_by, created_at)
  values (p_action, p_entity_id, p_entity_type, p_description, p_actor, now());
end;
$$;

-- Update archive_product_cascade to accept actor and log
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

  perform public.log_product_activity('ARCHIVE', p_product_id, 'product', 'Product archived', p_deleted_by);
end;
$$;

-- Update restore_product_cascade to log
create or replace function public.restore_product_cascade(p_product_id uuid, p_actor uuid default null)
returns void language plpgsql security definer as $$
begin
  update public.products set is_active = true, deleted_at = null, deleted_by = null where id = p_product_id;
  update public.product_variants set is_active = true, deleted_at = null, deleted_by = null where product_id = p_product_id;
  update public.school_products set is_active = true, deleted_at = null, deleted_by = null where product_id = p_product_id;
  update public.school_product_variants spv
    set is_active = true, deleted_at = null, deleted_by = null
  where spv.variant_id in (select id from public.product_variants where product_id = p_product_id);

  perform public.log_product_activity('RESTORE', p_product_id, 'product', 'Product restored', p_actor);
end;
$$;

-- Update hard_delete_product_cascade to log
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

  perform public.log_product_activity('HARD_DELETE', p_product_id, 'product', 'Product permanently deleted', p_actor);
end;
$$;
