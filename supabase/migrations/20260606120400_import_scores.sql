-- ===========================================================================
-- Authenticated bulk score import helper.
-- ===========================================================================

set search_path = public, extensions;

create or replace function public.import_score_rows(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  imported_count integer;
begin
  if auth.uid() is null then
    raise exception 'caller must be authenticated';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  with input_rows as (
    select
      (x->>'block_id')::uuid as block_id,
      nullif(trim(x->>'score_name'), '') as score_name,
      (x->>'score_value')::numeric as score_value
    from jsonb_array_elements(p_rows) as x
  ),
  valid_rows as (
    select block_id, score_name, score_value
    from input_rows
    where score_name is not null
      and score_value >= 0
      and score_value <= 1
  ),
  upserted as (
    insert into public.scores (block_id, score_name, score_value)
    select block_id, score_name, score_value
    from valid_rows
    on conflict (block_id, score_name)
    do update set score_value = excluded.score_value
    returning id
  )
  select count(*) into imported_count from upserted;

  return imported_count;
end;
$$;

revoke all on function public.import_score_rows(jsonb) from anon, public;
grant execute on function public.import_score_rows(jsonb) to authenticated;
