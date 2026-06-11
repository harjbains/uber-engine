create table if not exists public.charging_sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  vehicle_id uuid null,
  location_type text not null check (location_type in ('home', 'supercharger', 'public')),
  charger_name text,
  kwh_added numeric(10, 2),
  cost numeric(10, 2),
  start_time time,
  end_time time,
  active_charge_minutes integer,
  battery_start_percent numeric(5, 2),
  battery_end_percent numeric(5, 2),
  tariff_name text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists charging_sessions_date_idx
  on public.charging_sessions (date desc);

create index if not exists charging_sessions_location_type_idx
  on public.charging_sessions (location_type);
