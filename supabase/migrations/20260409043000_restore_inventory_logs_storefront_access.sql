-- Restore legacy inventory_logs access for storefront clients.
-- The current production bundle still inserts into inventory_logs after stock deduction.
-- This migration keeps that path working until the frontend cleanup is fully deployed.

alter table if exists public.inventory_logs enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on table public.inventory_logs to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inventory_logs'
      and policyname = 'inventory_logs_select_public'
  ) then
    create policy "inventory_logs_select_public"
      on public.inventory_logs
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inventory_logs'
      and policyname = 'inventory_logs_insert_public'
  ) then
    create policy "inventory_logs_insert_public"
      on public.inventory_logs
      for insert
      to anon, authenticated
      with check (true);
  end if;
end
$$;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end
$$;
