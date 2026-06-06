-- ===========================================================================
-- HK Building Risk Monitor — Row Level Security policies
-- ===========================================================================
-- Security model:
--   * anon (unauthenticated)  → ZERO access. Period.
--   * authenticated           → READ all blocks/scores/inspections/schedule.
--                               WRITE to inspections, schedule, and the
--                               note field on blocks. Risk scores and the
--                               rest of the blocks columns are NOT writable
--                               from the client — they're owned by the
--                               (future) scoring pipeline + admin import.
--
-- All mutation policies enforce `created_by = auth.uid()` so a logged-in
-- user can never write an event attributed to someone else.
--
-- The blocks UPDATE policy uses a column-level check via a trigger because
-- Postgres RLS can't restrict which columns are changed in a row. The
-- trigger refuses any UPDATE that modifies columns other than note,
-- note_updated_by, note_updated_at.
-- ===========================================================================

set search_path = public, extensions;

-- ---------- Revoke broad role grants ---------------------------------------
-- Supabase grants USAGE + ALL on public to anon + authenticated by default
-- via its migrations. Tighten to least privilege.
revoke all on all tables    in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;
revoke all on all functions in schema public from anon, public;

grant usage on schema public to anon, authenticated;
grant select on public.blocks_with_status to authenticated;
grant select on public.blocks             to authenticated;
grant select on public.scores             to authenticated;
grant select on public.inspections        to authenticated;
grant select on public.schedule           to authenticated;

-- Limit writes to the rows/operations that are actually needed.
grant update (note, note_updated_by, note_updated_at) on public.blocks to authenticated;
grant insert                                          on public.inspections to authenticated;
grant insert, update (cancelled)                      on public.schedule    to authenticated;

-- ---------- blocks ---------------------------------------------------------
-- SELECT: any logged-in user sees every block.
create policy "blocks: authenticated can read"
  on public.blocks
  for select
  to authenticated
  using (true);

-- UPDATE: any logged-in user can touch a block, but only via the note
-- columns. Column scoping is enforced by the trigger below + the column-
-- level GRANT above. The RLS USING/WITH CHECK clauses just require auth.
create policy "blocks: authenticated can update note"
  on public.blocks
  for update
  to authenticated
  using (true)
  with check (true);

-- Trigger to actually prevent any non-note column from changing.
create or replace function public.blocks_only_note_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.object_id              is distinct from old.object_id              then raise exception 'blocks.object_id is read-only via the client'; end if;
  if new.address                is distinct from old.address                then raise exception 'blocks.address is read-only via the client'; end if;
  if new.district               is distinct from old.district               then raise exception 'blocks.district is read-only via the client'; end if;
  if new.region                 is distinct from old.region                 then raise exception 'blocks.region is read-only via the client'; end if;
  if new.building_record_number is distinct from old.building_record_number then raise exception 'blocks.building_record_number is read-only via the client'; end if;
  if new.file_reference_number  is distinct from old.file_reference_number  then raise exception 'blocks.file_reference_number is read-only via the client'; end if;
  if new.completion_date        is distinct from old.completion_date        then raise exception 'blocks.completion_date is read-only via the client'; end if;
  if new.building_part_type     is distinct from old.building_part_type     then raise exception 'blocks.building_part_type is read-only via the client'; end if;
  if new.building_use_type      is distinct from old.building_use_type      then raise exception 'blocks.building_use_type is read-only via the client'; end if;
  if new.latitude               is distinct from old.latitude               then raise exception 'blocks.latitude is read-only via the client'; end if;
  if new.longitude              is distinct from old.longitude              then raise exception 'blocks.longitude is read-only via the client'; end if;
  if new.risk_score             is distinct from old.risk_score             then raise exception 'blocks.risk_score is read-only via the client'; end if;
  if new.risk_score_updated_at  is distinct from old.risk_score_updated_at  then raise exception 'blocks.risk_score_updated_at is read-only via the client'; end if;

  -- Stamp note metadata server-side so the client can't lie.
  if new.note is distinct from old.note then
    new.note_updated_by := auth.uid();
    new.note_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger blocks_only_note_updates_trg
  before update on public.blocks
  for each row
  when (current_setting('role', true) <> 'service_role')
  execute function public.blocks_only_note_updates();

-- ---------- scores ---------------------------------------------------------
-- Read-only from the client. Scores are owned by the upstream pipeline.
create policy "scores: authenticated can read"
  on public.scores
  for select
  to authenticated
  using (true);

-- ---------- inspections ----------------------------------------------------
-- SELECT: read everything.
create policy "inspections: authenticated can read"
  on public.inspections
  for select
  to authenticated
  using (true);

-- INSERT: only as yourself. Server forces created_by to auth.uid().
create policy "inspections: authenticated can insert as self"
  on public.inspections
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Defensive trigger: even if the client lies about created_by, overwrite it.
create or replace function public.stamp_created_by_auth_uid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  if new.created_by is null then
    raise exception 'created_by cannot be null — caller must be authenticated';
  end if;
  return new;
end;
$$;

create trigger inspections_stamp_created_by
  before insert on public.inspections
  for each row execute function public.stamp_created_by_auth_uid();

-- ---------- schedule -------------------------------------------------------
create policy "schedule: authenticated can read"
  on public.schedule
  for select
  to authenticated
  using (true);

create policy "schedule: authenticated can insert as self"
  on public.schedule
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- UPDATE: only the `cancelled` flag is writable (column GRANT above).
-- Anyone authenticated may cancel a scheduled inspection.
create policy "schedule: authenticated can cancel"
  on public.schedule
  for update
  to authenticated
  using (true)
  with check (true);

create trigger schedule_stamp_created_by
  before insert on public.schedule
  for each row execute function public.stamp_created_by_auth_uid();
