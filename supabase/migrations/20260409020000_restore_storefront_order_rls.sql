-- Restore storefront order write access for anon/authenticated clients.
-- Defensive migration for environments where earlier policies were not applied.

alter table if exists public.orders enable row level security;
alter table if exists public.order_items enable row level security;
alter table if exists public.order_notes enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.orders to anon, authenticated;
grant select, insert on table public.order_items to anon, authenticated;
grant select, insert on table public.order_notes to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
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
    select 1 from pg_policies
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
    select 1 from pg_policies
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
    select 1 from pg_policies
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
    select 1 from pg_policies
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
    select 1 from pg_policies
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
    select 1 from pg_policies
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
end
$$;
