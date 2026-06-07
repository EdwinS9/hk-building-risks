-- ===========================================================================
-- Persist the tunable sigmoid risk-model parameters (a1, a2, a3) so they
-- survive across sessions/devices instead of living only in browser
-- localStorage. The risk calculation reads these from the database.
--
--   risk = 100 × σ( a1(BA−30) + a2(LI−10) + a3×SAR )
--
-- A single-row table (id is pinned to 1) keeps the "current settings" simple
-- to read and upsert. Any authenticated inspector may read and update them.
-- ===========================================================================

set search_path = public, extensions;

create table if not exists public.score_params (
  id         smallint primary key default 1 check (id = 1),
  a1         numeric not null default 0.05,
  a2         numeric not null default 0.10,
  a3         numeric not null default 3.00,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Seed the single settings row with the model defaults.
insert into public.score_params (id, a1, a2, a3)
values (1, 0.05, 0.10, 3.00)
on conflict (id) do nothing;

alter table public.score_params enable row level security;

-- ---------- Grants ---------------------------------------------------------
-- Broad public grants are revoked elsewhere; grant least privilege here.
grant select                       on public.score_params to authenticated;
grant insert                       on public.score_params to authenticated;
grant update (a1, a2, a3)          on public.score_params to authenticated;

-- ---------- RLS policies ---------------------------------------------------
create policy "score_params: authenticated can read"
  on public.score_params
  for select
  to authenticated
  using (true);

create policy "score_params: authenticated can insert"
  on public.score_params
  for insert
  to authenticated
  with check (id = 1);

create policy "score_params: authenticated can update"
  on public.score_params
  for update
  to authenticated
  using (true)
  with check (true);

-- Stamp updated_by / updated_at server-side so the client can't lie or skip it.
create or replace function public.stamp_score_params_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'caller must be authenticated';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger score_params_stamp_meta
  before insert or update on public.score_params
  for each row execute function public.stamp_score_params_meta();

-- ===========================================================================
-- Recalculate using the stored parameters by default. When the caller omits
-- p_a1/p_a2/p_a3 (passes NULL), fall back to the row in score_params so the
-- database is the single source of truth for the model parameters.
-- ===========================================================================
-- Defensive: ensure no parameterless overload lingers (PostgREST ambiguity).
drop function if exists public.recalculate_block_risk_scores();

create or replace function public.recalculate_block_risk_scores(
  p_a1 numeric default null,
  p_a2 numeric default null,
  p_a3 numeric default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
  v_a1 numeric;
  v_a2 numeric;
  v_a3 numeric;
begin
  if auth.uid() is null then
    raise exception 'caller must be authenticated';
  end if;

  -- Resolve parameters: explicit args win, otherwise read the stored row,
  -- otherwise fall back to the model defaults.
  select
    coalesce(p_a1, sp.a1, 0.05),
    coalesce(p_a2, sp.a2, 0.10),
    coalesce(p_a3, sp.a3, 3.00)
  into v_a1, v_a2, v_a3
  from (select 1) one
  left join public.score_params sp on sp.id = 1;

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
  computed as (
    select
      b.id,
      round(
        100.0 / (
          1.0 + exp(
            greatest(-700, least(700, -(
              v_a1 * (
                coalesce(
                  (current_date - b.completion_date)::numeric / 365.25,
                  0
                ) - 30
              )
              + v_a2 * (
                case
                  when li.last_inspected is null then 100.0
                  else (current_date - li.last_inspected)::numeric / 365.25
                end - 10
              )
              + v_a3 * coalesce(sr.sar, 0)
            )))
          )
        ),
        2
      ) as risk_score
    from public.blocks b
    left join sar_rollup       sr on sr.block_id = b.id
    left join latest_inspections li on li.block_id = b.id
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

revoke all on function public.recalculate_block_risk_scores(numeric, numeric, numeric) from anon, public;
grant execute on function public.recalculate_block_risk_scores(numeric, numeric, numeric) to authenticated;
