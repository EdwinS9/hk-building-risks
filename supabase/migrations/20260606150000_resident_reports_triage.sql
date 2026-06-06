-- ===========================================================================
-- Resident Reports — triage state for the operator web dashboard
-- Adds read / solved tracking and lets authenticated operators read + triage
-- the reports submitted anonymously by residents.
-- ===========================================================================

set search_path = public, extensions;

-- ---------- Triage columns --------------------------------------------------
alter table public.resident_reports
  add column if not exists read_at   timestamptz,
  add column if not exists solved_at timestamptz;

comment on column public.resident_reports.read_at is
  'When an operator first marked this report as seen (no longer new). Null = unread.';
comment on column public.resident_reports.solved_at is
  'When an operator marked the underlying issue resolved. Null = unsolved / still open.';

-- Speeds up the dashboard''s "open vs solved" splits and recency sort.
create index if not exists resident_reports_solved_idx
  on public.resident_reports (solved_at, submitted_at desc);

-- ---------- RLS: operators (authenticated) can read + triage -----------------
-- Residents stay anonymous (anon insert only, from the original migration).
-- Operators sign in to the web dashboard and need to read every report and
-- update its triage state (read_at / solved_at).
create policy "Authenticated can read resident reports"
  on public.resident_reports
  for select
  to authenticated
  using (true);

create policy "Authenticated can triage resident reports"
  on public.resident_reports
  for update
  to authenticated
  using (true)
  with check (true);
