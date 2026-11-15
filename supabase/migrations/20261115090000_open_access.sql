-- MEIKA-X has no user accounts: drop the owner columns that pointed at auth.users.
drop view if exists public.case_summaries;

alter table public.cases drop column if exists user_id;
alter table public.reports drop column if exists user_id;
alter table public.watchlist drop column if exists created_by;

create view public.case_summaries with (security_invoker = true) as
select
  id,
  status,
  created_at,
  (record #- '{results,series}') - 'transcript' - 'ledger' as record,
  jsonb_array_length(coalesce(record -> 'ledger', '[]'::jsonb)) as ledger_count
from public.cases;

grant select on public.case_summaries to anon, authenticated;
grant all on public.case_summaries to service_role;
