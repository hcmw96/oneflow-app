-- App uses `shift_date` for the calendar day of a clock entry; legacy column was `date`.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'timesheets'
      and column_name = 'date'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'timesheets'
      and column_name = 'shift_date'
  ) then
    alter table public.timesheets rename column date to shift_date;
  end if;
end $$;
