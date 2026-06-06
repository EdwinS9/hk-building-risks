# HK Building Risk Monitor — Web App

Municipal inspection-triage dashboard for Hong Kong building risk. React + Vite
+ TypeScript + MapLibre GL on the frontend, Supabase (Postgres + Auth) on the
backend.

> Shared database setup (migrations, seed, first user) lives in the
> [repo root README](../../README.md#shared-database-supabase). Do that first.

## What you can do

- Sign in (invite-only — admin issues accounts).
- Browse risk-colored blocks across HK on the map.
- Triage queue (left): search, sort by score / name / district, filter by
  risk band and inspection status.
- Click a block (map or list) → opens the detail panel and flies to it.
- Inspect the score breakdown when available; completed inspections flow into
  the inspected log and update block status.
- Stale scores (older than 14 days) are flagged in both the list and detail.
- View **Inspected Log** and **Raw Data** as dedicated pages.
- **Settings** lets you switch theme (system / dark / light / high-contrast).

## Quick start

You need: Node 22+, npm, and a configured Supabase project (see repo root).

```bash
cd apps/web-app
nvm use                # picks up the repo .nvmrc (Node 22)
npm install
cp .env.example .env   # then fill in the Supabase values
npm run dev
```

From **Project Settings → API** in the Supabase dashboard:

- the **Project URL** → `VITE_SUPABASE_URL`
- the **anon public** key → `VITE_SUPABASE_ANON_KEY`

The anon key is safe to ship to the browser; the database is protected by
Row Level Security.

## Map tiles

Works with no key (CARTO dark / light raster fallback that matches the active
theme). For a higher-fidelity vector basemap, set a MapTiler key in `.env`:

```
VITE_MAPTILER_KEY=your_key
```

## Where data lives

All reads and mutations go through `src/data/blocks.ts`. That module:

- Reads from the `blocks_with_status` view to derive status / last_inspected.
- Joins `scores` to populate the per-factor breakdown in the detail panel.
- Imports score CSV rows into `scores` from the Account page after previewing
  object ID vs. building record number matches and normalizing the selected
  score scale.
- Imports inspection rows into the `inspections` table. `created_by` is
  stamped server-side by a `BEFORE INSERT` trigger to `auth.uid()` — the client
  cannot impersonate another user.
- The Account page can bulk import inspection logs from `object_id,date` CSVs,
  matching `object_id` against `blocks.building_record_number`; blocks missing
  from the CSV receive one generated fallback inspection date.
- The UI does not compute or guess risk scores; it consumes them.

## Security model

- Sign-up is **disabled** at the auth config level (`enable_signup = false`).
- All data tables have RLS enabled.
- Anonymous role: **no policies → no access.**
- Authenticated role: SELECT on blocks, scores, and inspections, INSERT on
  inspections, and column-scoped UPDATE on `blocks.note` only. Any attempt to
  update a different column on `blocks` is rejected by a row-level trigger.
- Score writes go through a dedicated authenticated database function rather
  than broad table write grants.
- `created_by` on inspections is overridden server-side, so a malicious client
  can't attribute events to other users.
- The frontend never sees a service-role key; only the anon key is used.

## File tree (excerpt)

```
apps/web-app/
├── index.html
├── vite.config.ts
└── src/
    ├── lib/
    │   ├── supabase.ts        # client
    │   ├── auth.ts            # session store
    │   ├── theme.ts           # theme store
    │   ├── constants.ts       # band thresholds, colors, HK center
    │   └── views.ts           # nav definitions
    ├── data/blocks.ts         # all data access (Supabase-backed)
    ├── components/
    │   ├── auth/LoginScreen.tsx
    │   ├── views/*            # Inspected log, Settings, Account
    │   ├── MapView.tsx
    │   ├── MapControls.tsx
    │   ├── TopBar.tsx
    │   ├── NavSidebar.tsx
    │   ├── TriageQueue.tsx
    │   ├── BlockDetail.tsx
    │   └── Legend.tsx
    └── styles/global.css
```
