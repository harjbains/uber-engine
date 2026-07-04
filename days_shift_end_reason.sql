alter table public.days
  add column if not exists shift_end_reason text;

comment on column public.days.shift_end_reason is
  'End-of-shift reason used by Uber Engine weekly behavioural summaries.';
