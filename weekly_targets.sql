create table if not exists public.weekly_targets (
  week_start date primary key,
  target numeric(10, 2) not null default 0,
  daily_hours_target numeric(6, 2) not null default 0,
  work_days integer[] not null default array[0, 1, 2, 3, 4, 5],
  target_snapshot numeric(10, 2),
  target_snapshot_mode text,
  target_is_custom boolean not null default false,
  hours_target_is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists weekly_targets_week_start_idx
  on public.weekly_targets (week_start desc);
