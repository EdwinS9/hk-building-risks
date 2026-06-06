# HK Building Risk — Project Summary

## Concept
A government-facing web portal that assigns **risk scores to city blocks** in Hong Kong to prioritize building inspections. The goal is to help authorities quickly identify which buildings need attention and dispatch the right teams efficiently.

## Core Idea: Unified Risk Score
Each city block (identified by existing HK Block IDs) gets a **single weighted risk score (0–100)**, composed of multiple sub-factors:

- **Structural/Collapse risk** — weighted heavily
- **Water damage risk** — weighted moderately
- **Potentially others** (e.g., chemical/environmental hazards) — TBD

The score is a weighted sum, allowing sub-factors to be surfaced individually while presenting a unified priority ranking.

## Data Granularity
- Data can be at **block level** (preferred, given HK already uses Block IDs)
- May also aggregate to **district/neighbourhood level** depending on data density
- Need to assess how dense the available data actually is before finalising

## UI: Map-First Dashboard
- **Interactive map** (e.g., Leaflet / OpenStreetMap) with buildings/blocks **colour-coded by risk score**
- Clicking a block opens a **detail panel** showing:
  - Breakdown of risk sub-scores
  - Building metadata
  - Recommended action
- Blocks sorted/surfaced by descending risk score for easy triage

## Workflow
1. Risk scores computed and displayed on map
2. Authority views map → sorts by highest risk
3. Clicks a block → sees what the problem is
4. Dispatches **inspection team** to assess and produce a report
5. After inspection, maintenance/repair authority takes over — the platform handles the handoff initiation

> Scope decision: the platform is for **government dispatch decisions**, not for managing the full inspection-to-repair chain.

## Inspection Types
- At minimum: **inspection need** (send assessors) vs **maintenance need** (send repair crew)
- Likely keep it as a single unified score for now; inspection type can be inferred from the dominant risk factor
- To be validated against real HK authority workflows

## Smart City Context (from SmartCity.md)
Relevant macro factors framing the problem:
- Ageing buildings requiring renovation & maintenance
- Ageing population
- Regulatory environment
- Economic constraints on maintenance budgets

## Open Questions
- [ ] What datasets are available for HK buildings (age, structure type, past incidents)?
- [ ] How dense are the block-level data points?
- [ ] Are there multiple inspection agency types we need to model?
- [ ] How do we accurately render block polygons on the map?
