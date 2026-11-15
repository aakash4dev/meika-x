-- MEIKA-X schema: cases, reports, monitoring (watchlist, alerts, state) and case images.
-- All writes go through the Next.js server with the secret (service-role) key.
-- Row Level Security is on everywhere; the public can read cases, reports and monitoring results.

-- ------------------------------------------------------------------ cases
create table public.cases (
  id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  question text not null,
  status text not null check (status in ('running', 'done', 'error')),
  grade text,
  region_name text,
  variable_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the full case record (transcript, ledger, results, brief) as the app uses it
  record jsonb not null
);

create index cases_created_at_idx on public.cases (created_at desc);
create index cases_user_id_idx on public.cases (user_id);
create index cases_running_idx on public.cases (status) where status = 'running';

-- Lists (home page, chat context, API) skip the heavy parts of each record.
create view public.case_summaries with (security_invoker = true) as
select
  id,
  user_id,
  status,
  created_at,
  (record #- '{results,series}') - 'transcript' - 'ledger' as record,
  jsonb_array_length(coalesce(record -> 'ledger', '[]'::jsonb)) as ledger_count
from public.cases;

-- ------------------------------------------------------------------ reports
create table public.reports (
  id text primary key,
  kind text not null check (kind in ('case', 'monitor')),
  title text not null,
  summary text not null default '',
  markdown text not null,
  case_id text,
  grade text,
  alerts integer,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index reports_created_at_idx on public.reports (created_at desc);
create index reports_case_id_idx on public.reports (case_id);

-- ------------------------------------------------------------------ monitoring
create table public.watchlist (
  id text primary key,
  name text not null,
  region_id text,
  bbox jsonb not null,
  rules jsonb not null,
  telegram boolean not null default true,
  last_run timestamptz,
  last_checks jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.alerts (
  id text primary key,
  item_id text not null,
  item_name text not null,
  rule text not null,
  level text not null,
  message text not null,
  link text,
  key text not null,
  telegram text not null,
  created_at timestamptz not null default now()
);

create index alerts_created_at_idx on public.alerts (created_at desc);

-- A single row holding the scheduler's bookkeeping (seen events, de-duplication keys, run count).
create table public.monitor_state (
  id integer primary key default 1 check (id = 1),
  state jsonb not null default '{"runs": 0, "seenEvents": {}, "alertKeys": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.monitor_state (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------------ access
alter table public.cases enable row level security;
alter table public.reports enable row level security;
alter table public.watchlist enable row level security;
alter table public.alerts enable row level security;
alter table public.monitor_state enable row level security;

create policy "Cases are readable by everyone" on public.cases for select to anon, authenticated using (true);
create policy "Reports are readable by everyone" on public.reports for select to anon, authenticated using (true);
create policy "Watchlist is readable by everyone" on public.watchlist for select to anon, authenticated using (true);
create policy "Alerts are readable by everyone" on public.alerts for select to anon, authenticated using (true);
-- monitor_state: no policy, so only the server (service role) can read or write it.

grant select on public.cases, public.case_summaries, public.reports, public.watchlist, public.alerts to anon, authenticated;
grant all on public.cases, public.case_summaries, public.reports, public.watchlist, public.alerts, public.monitor_state to service_role;

-- ------------------------------------------------------------------ storage
-- Satellite snapshots each case pulls (recent and one year earlier). Public read, server-only write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-images', 'case-images', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
