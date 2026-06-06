-- ===========================================================================
-- Resident building search — public, read-only building directory for the
-- anonymous resident PWA.
-- ===========================================================================
-- The resident app has no login, so it runs as the `anon` role. The security
-- model (20260606120100_security_policies.sql) gives anon ZERO access to the
-- `blocks` table, which is correct — risk scores, coordinates, file references
-- etc. must never be exposed to the public internet.
--
-- But residents still need to find and pick their own building. The only data
-- required for that is the public building identity: address + district. HK
-- building records are already public information; the sensitive columns are
-- the risk scores, which this view deliberately omits.
--
-- We expose those four columns through a SECURITY DEFINER view (security_invoker
-- = false). The view runs with its owner's privileges and therefore bypasses
-- RLS on `blocks`, but it can only ever return the columns selected here.
-- ===========================================================================

set search_path = public, extensions;

create or replace view public.resident_buildings
with (security_invoker = false) as
  select id, object_id, address, district
  from public.blocks;

comment on view public.resident_buildings is
  'Public, read-only building directory (id, object_id, address, district) for the '
  'anonymous resident PWA. Deliberately omits risk scores and all other columns.';

-- Read-only directory for everyone (anon + authenticated).
grant select on public.resident_buildings to anon, authenticated;
