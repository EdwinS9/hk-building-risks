-- ===========================================================================
-- Resident Reports — isolated table for the resident PWA app
-- No references to auth.users; submissions are fully anonymous.
-- ===========================================================================

set search_path = public, extensions;

-- ---------- resident_reports ------------------------------------------------
create table public.resident_reports (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references public.blocks(id) on delete cascade,
  description text not null check (char_length(description) >= 5 and char_length(description) <= 2000),
  photo_url   text,
  submitted_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

comment on table public.resident_reports is
  'Issue reports submitted anonymously by building residents via the resident PWA.';

create index resident_reports_block_id_idx on public.resident_reports (block_id, submitted_at desc);

alter table public.resident_reports enable row level security;

-- Anon users may insert; nobody reads via the API (admin access via dashboard).
create policy "Anon can submit resident reports"
  on public.resident_reports
  for insert
  to anon
  with check (true);

-- ---------- Storage bucket for report photos --------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resident-report-photos',
  'resident-report-photos',
  true,
  10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "Anon can upload resident report photos"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'resident-report-photos');

create policy "Public can view resident report photos"
  on storage.objects
  for select
  to public
  using (bucket_id = 'resident-report-photos');
