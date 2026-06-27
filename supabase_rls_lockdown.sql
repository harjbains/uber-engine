-- Emergency RLS lockdown for Uber Engine public tables.
--
-- Run this in the Supabase SQL Editor to stop anonymous public access.
-- Important: this intentionally does NOT add permissive anon policies.
-- The current browser-only Supabase client will lose access until the app
-- is moved to authenticated users or a backend-controlled data API.

begin;

alter table public.days enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_categories enable row level security;
alter table public.fuel_logs enable row level security;
alter table public.charging_sessions enable row level security;
alter table public.weekly_targets enable row level security;
alter table public.shifts enable row level security;

commit;

-- Verify RLS status after running:
--
-- select
--   schemaname,
--   tablename,
--   rowsecurity
-- from pg_tables
-- where schemaname = 'public'
-- order by tablename;

