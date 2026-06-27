-- Temporary restore for the current browser-only Uber Engine app.
--
-- Run this in Supabase SQL Editor if enabling RLS made existing data disappear
-- from the app. It only touches tables that exist in the live database.
--
-- SECURITY WARNING:
-- This restores app access for the anon browser client. It is a short-term
-- recovery step, not the final secure model. Replace with Supabase Auth
-- policies or a backend-only data API.

do $$
declare
  table_name text;
  table_names text[] := array[
    'days',
    'expenses',
    'expense_categories',
    'fuel_logs',
    'charging_sessions',
    'weekly_targets',
    'shifts'
  ];
begin
  foreach table_name in array table_names loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists "Temporary anon app access" on public.%I', table_name);
      execute format(
        'create policy "Temporary anon app access" on public.%I for all to anon using (true) with check (true)',
        table_name
      );
    end if;
  end loop;
end $$;

