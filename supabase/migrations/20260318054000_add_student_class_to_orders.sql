alter table public.orders
  add column if not exists student_class text;

update public.orders
set student_class = coalesce(student_class, grade)
where student_class is null
  and grade is not null;
