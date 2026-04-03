-- RLS policies to allow admin users to manage school_products while keeping tenant isolation.

alter table public.school_products enable row level security;

-- Existing tenant policy (keep if already present)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'school_products' and policyname = 'tenant-read-school-products'
  ) then
    create policy "tenant-read-school-products"
      on public.school_products
      for select
      using (school_id = current_setting('app.school_id', true)::uuid);
  end if;
end $$;

-- Admin bypass: allow authenticated users with admin/super_admin role to select/insert/update/delete
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'school_products' and policyname = 'admin-manage-school-products'
  ) then
    create policy "admin-manage-school-products"
      on public.school_products
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role in ('admin', 'super_admin')
        )
      )
      with check (
        exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role in ('admin', 'super_admin')
        )
      );
  end if;
end $$;
