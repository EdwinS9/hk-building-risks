-- ===========================================================================
-- Include resident-report count in the sigmoid risk model:
--
--   risk = 100 × σ( a1(BA−30) + a2(LI−10) + a3×SAR + a4×n_reports )
--
-- Each report adds a4 fictional years to the sigmoid argument.
-- a4 defaults to 5 (no DB column needed; tuned by callers via the parameter).
-- ===========================================================================

set search_path = public, extensions;

create or replace function public.recalculate_block_risk_scores(
  p_a1 numeric default 0.05,
  p_a2 numeric default 0.10,
  p_a3 numeric default 3.00,
  p_a4 numeric default 5.00
)
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
  sar_rollup as (
    select block_id, avg(score_value) as sar
    from public.scores
    group by block_id
  ),
  report_counts as (
    select block_id, count(*)::numeric as n_reports
    from public.resident_reports
    group by block_id
  ),
  computed as (
    select
      b.id,
      round(
        100.0 / (
          1.0 + exp(
            greatest(-700, least(700, -(
              -- Building-age term: BA − 30
              p_a1 * (
                coalesce(
                  (current_date - b.completion_date)::numeric / 365.25,
                  0
                ) - 30
              )
              -- Inspection-lag term: LI − 10
              + p_a2 * (
                case
                  when li.last_inspected is null then 100.0
                  else (current_date - li.last_inspected)::numeric / 365.25
                end - 10
              )
              -- SAR term
              + p_a3 * coalesce(sr.sar, 0)
              -- Reports term: each report adds a4 fictional years
              + p_a4 * coalesce(rc.n_reports, 0)
            )))
          )
        ),
        2
      ) as risk_score
    from public.blocks b
    left join sar_rollup          sr on sr.block_id = b.id
    left join latest_inspections  li on li.block_id = b.id
    left join report_counts       rc on rc.block_id = b.id
  ),
  updated as (
    update public.blocks b
    set
      risk_score            = c.risk_score,
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

revoke all on function public.recalculate_block_risk_scores(numeric, numeric, numeric, numeric) from anon, public;
grant execute on function public.recalculate_block_risk_scores(numeric, numeric, numeric, numeric) to authenticated;
