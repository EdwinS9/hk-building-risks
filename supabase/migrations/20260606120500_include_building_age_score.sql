-- ===========================================================================
-- Include derived building-age risk in aggregate risk score recalculation.
-- ===========================================================================

set search_path = public, extensions;

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
          + case
              when b.completion_date is null then 0
              when (current_date - b.completion_date)::numeric / 365.25 <= 25 then 0
              when (current_date - b.completion_date)::numeric / 365.25 >= 60 then 100
              else round(((((current_date - b.completion_date)::numeric / 365.25) - 25) / 35) * 100)
            end
        ) / (coalesce(sr.stored_score_count, 0) + 2),
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

revoke all on function public.recalculate_block_risk_scores() from anon, public;
grant execute on function public.recalculate_block_risk_scores() to authenticated;
