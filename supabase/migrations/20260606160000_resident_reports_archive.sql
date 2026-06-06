-- ===========================================================================
-- Resident Reports — archive support
-- Archived reports are hidden from every operator view except the dedicated
-- Archive, but never deleted (kept for the record).
-- ===========================================================================

set search_path = public, extensions;

alter table public.resident_reports
  add column if not exists archived_at timestamptz;

comment on column public.resident_reports.archived_at is
  'When an operator archived this report. Archived reports are hidden everywhere except the Archive view. Null = active.';

-- Partial index over the active set — the default dashboard only ever lists
-- non-archived reports, so keep that lookup cheap.
create index if not exists resident_reports_active_idx
  on public.resident_reports (submitted_at desc)
  where archived_at is null;

-- The existing "Authenticated can triage resident reports" UPDATE policy
-- already covers writes to archived_at, so no new policy is required.
