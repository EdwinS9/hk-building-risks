-- ===========================================================================
-- Remove scheduling from the database model.
-- ===========================================================================

set search_path = public, extensions;

drop view if exists public.blocks_with_status;

create or replace view public.blocks_with_status
with (security_invoker = true) as
select
  b.*,
  (select max(inspected_at) from public.inspections i where i.block_id = b.id) as last_inspected,
  case
    when exists (select 1 from public.inspections i where i.block_id = b.id) then 'Inspected'
    else 'Not scheduled'
  end as status
from public.blocks b;

comment on view public.blocks_with_status is
  'Convenience view joining latest inspection data to a block. status is derived from inspection history. Use security_invoker so RLS on underlying tables is respected.';

grant select on public.blocks_with_status to authenticated;

drop table if exists public.schedule cascade;
