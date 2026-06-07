# DB Fix — Risk Score Recalculation

## Problem

The **Calculate** button in the Triage Queue doesn't save scores permanently. The root cause is a PostgreSQL function overload ambiguity: when the risk formula was updated, the old parameterless version of `recalculate_block_risk_scores()` was not dropped. PostgREST finds two functions with the same name and refuses to call either.

## Fix (2 minutes)

1. Open the Supabase SQL editor for the project:  
   **https://supabase.com/dashboard/project/wbvxoeewumjkrhfjzsbm/sql/new**

2. Paste the following and click **Run**:

```sql
drop function if exists public.recalculate_block_risk_scores();
```

3. Done. No data is lost — only the old empty-parameter version of the function is removed. The current version (which accepts `p_a1`, `p_a2`, `p_a3`) stays intact.

## Verify it worked

Run this in the same SQL editor — it should return exactly **one** row:

```sql
select proname, pronargs
from pg_proc
where proname = 'recalculate_block_risk_scores'
  and pronamespace = 'public'::regnamespace;
```

If you see one row with `pronargs = 3`, the fix is applied correctly.
