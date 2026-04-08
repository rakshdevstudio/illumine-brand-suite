-- Keep anonymous storefront checkout working even when order timeline triggers fire.
-- This migration is intentionally idempotent so it can repair drifted environments.

alter table if exists public.orders enable row level security;
alter table if exists public.order_items enable row level security;
alter table if exists public.order_notes enable row level security;
alter table if exists public.order_timeline enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.orders to anon, authenticated;
grant select, insert on table public.order_items to anon, authenticated;
grant select, insert on table public.order_notes to anon, authenticated;
grant select on table public.order_timeline to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'orders_select_public'
  ) then
    create policy "orders_select_public"
      on public.orders
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'orders_insert_public'
  ) then
    create policy "orders_insert_public"
      on public.orders
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'orders_update_public'
  ) then
    create policy "orders_update_public"
      on public.orders
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'order_items_select_public'
  ) then
    create policy "order_items_select_public"
      on public.order_items
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'order_items_insert_public'
  ) then
    create policy "order_items_insert_public"
      on public.order_items
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notes'
      and policyname = 'order_notes_select_public'
  ) then
    create policy "order_notes_select_public"
      on public.order_notes
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notes'
      and policyname = 'order_notes_insert_public'
  ) then
    create policy "order_notes_insert_public"
      on public.order_notes
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_timeline'
      and policyname = 'order_timeline_select_public'
  ) then
    create policy "order_timeline_select_public"
      on public.order_timeline
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

create or replace function public.log_order_created_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_timeline(order_id, event_type, description, created_by)
  values (new.id, 'ORDER_PLACED', 'Order placed by customer', auth.uid());
  return new;
end;
$$;

create or replace function public.log_order_status_change_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_event_description text;
begin
  if new.status is distinct from old.status then
    case upper(coalesce(new.status::text, ''))
      when 'PACKED' then
        v_event_type := 'PACKED';
        v_event_description := 'Order packed';
      when 'DISPATCHED' then
        v_event_type := 'DISPATCHED';
        v_event_description := 'Order dispatched';
      when 'DELIVERED' then
        v_event_type := 'DELIVERED';
        v_event_description := 'Order delivered';
      when 'CANCELLED' then
        v_event_type := 'CANCELLED';
        v_event_description := 'Order cancelled';
      when 'PLACED' then
        v_event_type := 'ORDER_PLACED';
        v_event_description := 'Order placed';
      when 'CONFIRMED' then
        v_event_type := 'PACKED';
        v_event_description := 'Order packed';
      when 'SHIPPED' then
        v_event_type := 'DISPATCHED';
        v_event_description := 'Order dispatched';
      when 'REFUNDED' then
        v_event_type := 'CANCELLED';
        v_event_description := 'Order cancelled';
      when 'PENDING' then
        v_event_type := 'ORDER_PLACED';
        v_event_description := 'Order placed';
      else
        v_event_type := null;
        v_event_description := null;
    end case;

    if v_event_type is not null then
      insert into public.order_timeline(order_id, event_type, description, created_by)
      values (new.id, v_event_type, v_event_description, auth.uid());
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.log_note_added_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_timeline(order_id, event_type, description, created_by)
  values (new.order_id, 'NOTE_ADDED', 'Admin added note', new.created_by);
  return new;
end;
$$;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end
$$;
