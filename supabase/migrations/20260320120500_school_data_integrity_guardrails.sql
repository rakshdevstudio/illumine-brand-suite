-- Guardrails for school-level analytics integrity.
-- 1) Ensure orders.school_id references schools.id.
-- 2) Add lookup index on orders.school_id.
-- 3) Enforce normalized schools.name uniqueness only when existing data is already clean.

create index if not exists orders_school_id_idx on public.orders (school_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_school_id_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_school_id_fkey
      foreign key (school_id)
      references public.schools(id)
      on update cascade
      on delete set null
      not valid;
  end if;
end
$$;

do $$
declare
  has_duplicates boolean;
begin
  select exists (
    select 1
    from (
      select lower(trim(regexp_replace(name, '\\s+', ' ', 'g'))) as normalized_name
      from public.schools
      group by normalized_name
      having count(*) > 1
    ) dup
  ) into has_duplicates;

  if has_duplicates then
    raise notice 'Skipping normalized unique index on schools(name): duplicates exist and require manual cleanup.';
  else
    create unique index if not exists schools_name_normalized_unique_idx
      on public.schools ((lower(trim(regexp_replace(name, '\\s+', ' ', 'g')))));
  end if;
end
$$;
