# HK Building Risk Monitor

Municipal inspection-triage dashboard for Hong Kong building risk. React + Vite
+ TypeScript + MapLibre GL on the frontend, Supabase (Postgres + Auth) on the
backend.

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

You need: Node 22+, npm, the [Supabase CLI](https://supabase.com/docs/guides/cli),
and a Supabase project.

```bash
nvm use                # picks up .nvmrc (Node 22)
npm install
cp .env.example .env   # then fill in the Supabase values
npm run dev
```

### 1. Create the Supabase project

In the Supabase dashboard, create a new project. From **Project Settings → API**
copy:

- the **Project URL** → `VITE_SUPABASE_URL`
- the **anon public** key → `VITE_SUPABASE_ANON_KEY`

The anon key is safe to ship to the browser; the database is protected by
Row Level Security.

### 2. Apply migrations

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies the migrations in `supabase/migrations/`:

- `20260606120000_initial_schema.sql` — tables (`blocks`, `scores`,
  `inspections`, legacy `schedule`), the `blocks_with_status` view, and triggers.
- `20260606120100_security_policies.sql` — RLS policies. **Anonymous users
  get zero access.** Authenticated users can read blocks, scores, and
  inspections, and can write inspections and the per-block note. All other columns
  (coordinates, risk score, identifiers) are read-only from the client and
  managed by the upstream scoring pipeline / admin import.
- `20260606120300_remove_schedule.sql` — removes the scheduling table and
  derives status from inspection history only.
- `20260606120400_import_scores.sql` — adds a narrow authenticated score
  import function used by the Account page CSV import.

### 3. (Optional) Seed with mock data

`supabase/seed.sql` contains 50 HK blocks with a few per-factor scores.
Two options:

```bash
# A) Wipe and re-seed the LOCAL stack:
supabase db reset

# B) Apply seed to your linked REMOTE project (one-time):
supabase db execute --file supabase/seed.sql
```

### 4. Create the first user

Sign-up is disabled in `supabase/config.toml` (invite-only). Use the
dashboard:

1. **Authentication → Users → Invite user** — enter an email.
2. The user clicks the magic link in the invite email, sets a password, and
   can then sign in.

For local dev (`supabase start`), use the [Inbucket](http://localhost:54324)
UI to read the invite email and confirm.

### 5. Run the app

```bash
npm run dev
```

You'll land on the **Sign in** screen. Use the invited account's email +
password.

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
hk-building-risks/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260606120000_initial_schema.sql
│   │   └── 20260606120100_security_policies.sql
│   └── seed.sql
├── src/
│   ├── lib/
│   │   ├── supabase.ts        # client
│   │   ├── auth.ts            # session store
│   │   ├── theme.ts           # theme store
│   │   ├── constants.ts       # band thresholds, colors, HK center
│   │   └── views.ts           # nav definitions
│   ├── data/blocks.ts         # all data access (Supabase-backed)
│   ├── components/
│   │   ├── auth/LoginScreen.tsx
│   │   ├── views/*            # Inspected log, Settings, Account
│   │   ├── MapView.tsx
│   │   ├── MapControls.tsx
│   │   ├── TopBar.tsx
│   │   ├── NavSidebar.tsx
│   │   ├── TriageQueue.tsx
│   │   ├── BlockDetail.tsx
│   │   └── Legend.tsx
│   └── styles/global.css
└── README.md
```
