-- Harden activity-log attribution for product lifecycle RPCs.
-- This removes the silent-failure helper behavior and guarantees actor-preserving inserts.

create or replace function public.ensure_profile_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name)
  select
    au.id,
    au.email,
    coalesce(au.raw_user_meta_data->>'full_name', '')
  from auth.users au
  where au.id = p_user_id
  on conflict (id) do nothing;
end;
$$;

create or replace function public.log_product_activity(
  p_action text,
  p_entity_id uuid,
  p_entity_type text,
  p_description text,
  p_actor uuid default null
) returns void
language plpgsql
security definer
as $$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if v_actor is null then
    raise exception 'Activity log actor is required';
  end if;

  perform public.ensure_profile_for_user(v_actor);

  insert into public.activity_logs(
    action_type,
    entity_id,
    entity_type,
    description,
    performed_by,
    created_at
  )
  values (
    p_action,
    p_entity_id,
    p_entity_type,
    p_description,
    v_actor,
    now()
  );
exception
  when others then
    raise;
end;
$$;

create or replace function public.archive_product_cascade(
  p_product_id uuid,
  p_deleted_at timestamptz,
  p_deleted_by uuid default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_actor uuid := coalesce(p_deleted_by, auth.uid());
begin
  if v_actor is null then
    raise exception 'Activity log actor is required';
  end if;

  perform public.ensure_profile_for_user(v_actor);

  update public.products
    set is_active = false, deleted_at = p_deleted_at, deleted_by = v_actor
  where id = p_product_id;

  update public.product_variants
    set is_active = false, deleted_at = p_deleted_at, deleted_by = v_actor
  where product_id = p_product_id;

  update public.school_products
    set is_active = false, deleted_at = p_deleted_at, deleted_by = v_actor
  where product_id = p_product_id;

  update public.school_product_variants spv
    set is_active = false, deleted_at = p_deleted_at, deleted_by = v_actor
  where spv.variant_id in (select id from public.product_variants where product_id = p_product_id);

  perform public.log_product_activity('ARCHIVE', p_product_id, 'product', 'Product archived', v_actor);
end;
$$;

create or replace function public.restore_product_cascade(
  p_product_id uuid,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if v_actor is null then
    raise exception 'Activity log actor is required';
  end if;

  perform public.ensure_profile_for_user(v_actor);

  update public.products
    set is_active = true, deleted_at = null, deleted_by = null
  where id = p_product_id;

  update public.product_variants
    set is_active = true, deleted_at = null, deleted_by = null
  where product_id = p_product_id;

  update public.school_products
    set is_active = true, deleted_at = null, deleted_by = null
  where product_id = p_product_id;

  update public.school_product_variants spv
    set is_active = true, deleted_at = null, deleted_by = null
  where spv.variant_id in (select id from public.product_variants where product_id = p_product_id);

  perform public.log_product_activity('RESTORE', p_product_id, 'product', 'Product restored', v_actor);
end;
$$;

create or replace function public.hard_delete_product_cascade(
  p_product_id uuid,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if v_actor is null then
    raise exception 'Activity log actor is required';
  end if;

  perform public.ensure_profile_for_user(v_actor);

  delete from public.school_product_variants
    where variant_id in (select id from public.product_variants where product_id = p_product_id);

  delete from public.inventory
    where variant_id in (select id from public.product_variants where product_id = p_product_id);

  delete from public.product_variants
    where product_id = p_product_id;
  delete from public.school_products
    where product_id = p_product_id;
  delete from public.products
    where id = p_product_id;

  perform public.log_product_activity('HARD_DELETE', p_product_id, 'product', 'Product permanently deleted', v_actor);
end;
$$;
