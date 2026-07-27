alter table public.days
  add column if not exists trip_time numeric(6, 2) not null default 0,
  add column if not exists available_time numeric(6, 2) not null default 0,
  add column if not exists lost_time numeric(6, 2) not null default 0;

comment on column public.days.trip_time is
  'Hours spent driving to pickups or completing passenger trips.';

comment on column public.days.available_time is
  'Hours online, positioned and genuinely available to accept suitable work.';

comment on column public.days.lost_time is
  'Online hours lost to extended breaks, errands or avoidable delays.';
