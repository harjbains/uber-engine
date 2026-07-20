create table if not exists public.cashflow_months (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cashflow_months_updated_at_idx
  on public.cashflow_months (updated_at desc);

comment on table public.cashflow_months is
  'Monthly cashflow workspace state for safe balance, fixed payments, spending ledger, and payslip rows.';

comment on column public.cashflow_months.state is
  'JSON state for the current cashflow workspace. Kept flexible while the product workflow is still evolving.';
