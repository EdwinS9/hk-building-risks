-- ===========================================================================
-- Recalculate aggregate block risk scores from stored breakdown factors plus
-- the derived "Last inspected" score.
-- ===========================================================================

set search_path = public, extensions;

-- Permit the dedicated recalculation function below to update only risk_score
-- and risk_score_updated_at while keeping ordinary client block updates locked
-- to notes.
create or replace function public.blocks_only_note_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.recalculating_risk_scores', true) = 'on' then
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
    if new.note                   is distinct from old.note                   then raise exception 'blocks.note is not writable during risk score recalculation'; end if;
    if new.note_updated_by        is distinct from old.note_updated_by        then raise exception 'blocks.note_updated_by is not writable during risk score recalculation'; end if;
    if new.note_updated_at        is distinct from old.note_updated_at        then raise exception 'blocks.note_updated_at is not writable during risk score recalculation'; end if;
    return new;
  end if;

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

create or replace function public.recalculate_block_risk_scores()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'caller must be authenticated';
  end if;

  perform set_config('app.recalculating_risk_scores', 'on', true);

  with latest_inspections as (
    select block_id, max(inspected_at) as last_inspected
    from public.inspections
    group by block_id
  ),
  score_rollup as (
    select
      block_id,
      count(*)::numeric as stored_score_count,
      sum(score_value * 100)::numeric as stored_score_total
    from public.scores
    group by block_id
  ),
  computed as (
    select
      b.id,
      round(
        (
          coalesce(sr.stored_score_total, 0)
          + case
              when li.last_inspected is null then 100
              when (current_date - li.last_inspected)::numeric / 365.25 <= 1 then 0
              when (current_date - li.last_inspected)::numeric / 365.25 >= 30 then 100
              else round(((((current_date - li.last_inspected)::numeric / 365.25) - 1) / 29) * 100)
            end
        ) / (coalesce(sr.stored_score_count, 0) + 1),
        2
      ) as risk_score
    from public.blocks b
    left join score_rollup sr on sr.block_id = b.id
    left join latest_inspections li on li.block_id = b.id
  ),
  updated as (
    update public.blocks b
    set
      risk_score = c.risk_score,
      risk_score_updated_at = now()
    from computed c
    where b.id = c.id
      and b.risk_score is distinct from c.risk_score
    returning b.id
  )
  select count(*) into updated_count from updated;

  perform set_config('app.recalculating_risk_scores', 'off', true);
  return updated_count;
exception
  when others then
    perform set_config('app.recalculating_risk_scores', 'off', true);
    raise;
end;
$$;

revoke all on function public.blocks_only_note_updates() from anon, public;
revoke all on function public.recalculate_block_risk_scores() from anon, public;
grant execute on function public.recalculate_block_risk_scores() to authenticated;
