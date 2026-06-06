-- ===========================================================================
-- HK Building Risk Monitor — initial schema
-- ===========================================================================
-- Tables:
--   blocks       — one row per building / block
--   scores       — per-factor breakdown contributing to a block's risk score
--   inspections  — historical record of completed inspections (append-only)
--   schedule     — historical record of scheduled inspections (append-only,
--                  with a `cancelled` flag rather than delete for audit)
--
-- View:
--   blocks_with_status — joins the latest event per block to derive
--                        last_inspected, next_scheduled, and a status string
--                        of 'Inspected' | 'Scheduled' | 'Not scheduled'.
--
-- All tables have RLS enabled here but policies are added in the next
-- migration (20260606120100_security_policies.sql).
-- ===========================================================================

set search_path = public, extensions;

create extension if not exists "pgcrypto";

-- ---------- blocks ----------------------------------------------------------
create table public.blocks (
  id                     uuid primary key default gen_random_uuid(),
  object_id              text not null unique,
  address                text not null,
  district               text not null,
  region                 text,
  building_record_number text,
  file_reference_number  text,
  completion_date        date,
  building_part_type     text,
  building_use_type      text,
  latitude               numeric(10, 7) not null check (latitude  between -90  and 90),
  longitude              numeric(10, 7) not null check (longitude between -180 and 180),
  note                   text,
  note_updated_by        uuid references auth.users(id) on delete set null,
  note_updated_at        timestamptz,
  risk_score             numeric(5, 2) not null check (risk_score between 0 and 100),
  risk_score_updated_at  timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table  public.blocks is 'One building / block tracked by the risk monitor. Risk score is a precomputed input from an upstream scoring pipeline; the frontend never recomputes it.';
comment on column public.blocks.object_id is 'External / domain identifier used in HK building records.';
comment on column public.blocks.note is 'Free-text shared note. Last writer wins; track who and when via note_updated_by / note_updated_at.';

create index blocks_district_idx        on public.blocks (district);
create index blocks_risk_score_desc_idx on public.blocks (risk_score desc);

-- ---------- scores ---------------------------------------------------------
create table public.scores (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references public.blocks(id) on delete cascade,
  score_name  text not null,
  score_value numeric(6, 4) not null check (score_value >= 0 and score_value <= 1),
  created_at  timestamptz not null default now(),
  unique (block_id, score_name)
);

comment on table  public.scores is 'Per-factor breakdown contributing to a block''s aggregate risk score. score_value is a normalized contribution in [0, 1].';
create index scores_block_id_idx on public.scores (block_id);

-- ---------- inspections ----------------------------------------------------
create table public.inspections (
  id            uuid primary key default gen_random_uuid(),
  block_id      uuid not null references public.blocks(id) on delete cascade,
  inspected_at  date not null,
  notes         text,
  created_by    uuid not null references auth.users(id) on delete restrict,
  created_at    timestamptz not null default now()
);

comment on table  public.inspections is 'Append-only history of completed inspections. Each row represents a single inspection event by a specific user.';
create index inspections_block_id_created_at_idx on public.inspections (block_id, created_at desc);

-- ---------- schedule -------------------------------------------------------
create table public.schedule (
  id             uuid primary key default gen_random_uuid(),
  block_id       uuid not null references public.blocks(id) on delete cascade,
  scheduled_for  date not null,
  cancelled      boolean not null default false,
  created_by     uuid not null references auth.users(id) on delete restrict,
  created_at     timestamptz not null default now()
);

comment on table  public.schedule is 'Append-only history of scheduled inspection dates. Re-scheduling adds a new row; cancellations flip the cancelled flag rather than deleting (audit).';
create index schedule_block_id_created_at_idx on public.schedule (block_id, created_at desc);
create index schedule_open_idx                on public.schedule (block_id, scheduled_for) where cancelled = false;

-- ---------- updated_at trigger ---------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger blocks_set_updated_at
  before update on public.blocks
  for each row execute function public.set_updated_at();

-- ---------- blocks_with_status view ----------------------------------------
-- Status derivation: whichever event (inspection vs. non-cancelled schedule)
-- was created most recently wins. No events ⇒ 'Not scheduled'.
create or replace view public.blocks_with_status
with (security_invoker = true) as
with events as (
  select block_id, created_at, 'inspection'::text as event_type
    from public.inspections
  union all
  select block_id, created_at, 'schedule'::text as event_type
    from public.schedule
    where cancelled = false
),
latest_event as (
  select distinct on (block_id) block_id, event_type, created_at
  from events
  order by block_id, created_at desc
)
select
  b.*,
  (select max(inspected_at) from public.inspections i where i.block_id = b.id) as last_inspected,
  (
    select min(scheduled_for)
    from public.schedule s
    where s.block_id = b.id
      and s.cancelled = false
      and s.scheduled_for >= current_date
  ) as next_scheduled,
  case
    when le.event_type = 'inspection' then 'Inspected'
    when le.event_type = 'schedule'   then 'Scheduled'
    else 'Not scheduled'
  end as status
from public.blocks b
left join latest_event le on le.block_id = b.id;

comment on view public.blocks_with_status is
  'Convenience view joining latest inspection/schedule events to a block. status is derived (latest event wins). Use security_invoker so RLS on underlying tables is respected.';

-- ---------- Enable RLS now; policies arrive in the next migration ----------
alter table public.blocks      enable row level security;
alter table public.scores      enable row level security;
alter table public.inspections enable row level security;
alter table public.schedule    enable row level security;
