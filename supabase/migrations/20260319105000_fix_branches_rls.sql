alter table public.branches enable row level security;

drop policy if exists "Branches readable by authenticated" on public.branches;
create policy "Branches readable by authenticated"
on public.branches
for select
to authenticated
using (true);

drop policy if exists "Branches insertable by admins and staff" on public.branches;
create policy "Branches insertable by admins and staff"
on public.branches
for insert
to authenticated
with check (
  public.has_role(auth.uid(), 'super_admin')
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'staff')
);

drop policy if exists "Branches updatable by admins and staff" on public.branches;
create policy "Branches updatable by admins and staff"
on public.branches
for update
to authenticated
using (
  public.has_role(auth.uid(), 'super_admin')
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'staff')
)
with check (
  public.has_role(auth.uid(), 'super_admin')
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'staff')
);

drop policy if exists "Branches deletable by super admins" on public.branches;
create policy "Branches deletable by super admins"
on public.branches
for delete
to authenticated
using (
  public.has_role(auth.uid(), 'super_admin')
);
