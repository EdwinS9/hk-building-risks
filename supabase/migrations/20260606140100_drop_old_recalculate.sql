-- Drop the old parameterless overload so PostgREST isn't confused by two
-- functions with the same name but different signatures.
-- The replacement (with p_a1/p_a2/p_a3 defaults) was added in 20260606140000.

drop function if exists public.recalculate_block_risk_scores();
