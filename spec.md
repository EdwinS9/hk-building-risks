# HK Building Risk Assessment | Spec

A risk assessment platform for Hong Kong buildings that scores and surfaces structural, fire, and environmental risk to help government authorities prioritise inspection resources.

> Status: v0 draft. This is a living document. Sections marked `TODO` are placeholders. Sections marked `⚠️ CONFLICT` need a team decision.

## 1. Problem

Hong Kong has a large stock of ageing high-density buildings operating under economic and regulatory constraints that strain maintenance budgets. Risk signals (unauthorised building works, water seepage, fire-safety defects, structural deterioration) are spread across disconnected government datasets and inspection records. There is no single view that ranks buildings by risk to guide where limited inspection resources should go.

## 2. Goals

- Produce a risk score from available open data, surfaced on an interactive map.
- Explain *why* a unit scores the way it does (sub-factor breakdown).
- Enable government authorities to sort by risk and dispatch the right team.
- Be reproducible and demoable within the hackathon timebox.

### Non-goals (v1)

- Real-time sensor ingestion.
- Legal or regulatory determinations.
- Coverage outside Hong Kong.
- Managing the full inspection-to-repair chain (platform handles dispatch initiation only; handoff to the relevant maintenance authority happens after inspection).

## 3. Users

> ⚠️ **CONFLICT — team decision needed.**
>
> The original spec defined three user types: inspectors/regulators, building owners/management, and the public. The Project Summary scoped this down to **government dispatch only** (authorities triaging which blocks to inspect next). Building owners and the public are cut from that view.
>
> **Options:** (a) Government-only for v1, owner/public views as future scope. (b) Keep all three from the start. Recommend (a) to stay focused for the hackathon.

**Working assumption (pending decision):** Government-facing portal only.

- **Inspectors / regulators**: view the risk map, sort by score, click a block for the sub-factor breakdown, and dispatch the appropriate team.

## 4. Data Sources

`TODO`: confirm and list with licences and refresh cadence. Candidates:

- HK Buildings Department records (UBW orders, inspection notices).
- Rating and Valuation Department building attributes (age, use, storeys).
- Lands Department / OpenStreetMap — block polygons and address geocoding.
- Fire Services Department notices.
- Weather / flooding / slope (GEO landslip) data.

## 5. Scoring Granularity

> ⚠️ **CONFLICT — team decision needed.**
>
> The original spec scored at **per-building** level. The Project Summary decided on **per-block level** using existing HK Block IDs, on the grounds that government data and the map UI align more naturally to blocks.
>
> The right answer depends on data density: if block-level data is sparse, per-building scoring may still be feasible; if data is only available aggregated to blocks, per-block is forced. This must be confirmed once the first dataset is acquired (M1).
>
> **Options:** (a) Block-level (Block IDs) — coarser, easier to map, matches HK admin structure. (b) Per-building — finer, distinguishes risk within a block. Recommend deciding at M1 based on actual data density.

**Working assumption (pending M1 data check):** Block-level scoring using HK Block IDs, with the option to drill to per-building if data supports it.

## 6. Risk Model

### Sub-factors and weights

The unified score (0–100) is a weighted sum of sub-factors. Weights are indicative and subject to revision:

| Sub-factor | Weight | Notes |
|---|---|---|
| Structural / collapse risk | High | Primary driver |
| Water damage risk | Medium | Seepage, drainage |
| Chemical / environmental hazard | TBD | Scope to be confirmed |
| Fire safety | TBD | FSD notices |

### Features (per scoring unit)

Building age, height/storeys, use class, historical UBW orders/inspection notices, density, proximity to slopes, last inspection date.

### Approach

- **v1:** Transparent weighted scoring — explainable baseline, fast to ship.
- **v2:** Supervised model (e.g. gradient boosting) trained on historical incident/order labels, with SHAP-style explanations.

### Output

0–100 unified risk score + categorical band (Low / Medium / High) + top contributing sub-factors. Inspection type (what kind of team to send) is **inferred from the dominant sub-factor**, not modelled separately.

### Evaluation

`TODO`: define labels and metrics (e.g. ranking quality vs. historical orders, calibration). Hold out a test set.

## 7. UI

Map-first dashboard:

- Interactive map (Leaflet / OpenStreetMap) with blocks colour-coded by risk score.
- Default view sorted by descending risk score.
- Clicking a block opens a detail panel showing: sub-score breakdown, block metadata, recommended action.
- Search and filter by risk band, district, sub-factor.

## 8. Architecture

```
data sources → ingestion / ETL → feature store → model → API → web app (map + detail panel)
```

- **Backend / model:** Python (pandas, scikit-learn).
- **API:** REST endpoint serving scores and sub-factor breakdowns by Block ID.
- **Frontend:** JS/TS with Leaflet / Mapbox.

## 9. Milestones

- [ ] M0: Repo + spec (this).
- [ ] M1: Acquire and clean one core dataset; confirm block vs. building granularity.
- [ ] M2: Baseline weighted risk score + CSV output.
- [ ] M3: API serving scores + sub-factor explanations.
- [ ] M4: Map UI — colour-coded blocks, click-to-detail, sort/filter.
- [ ] M5: Demo polish + presentation.

## 10. Open Questions

- Which datasets are openly licensed and reliable enough to ship?
- What is the ground-truth label for "risk" (orders issued? incidents recorded?)?
- How do we reliably join/geocode across datasets to a common Block ID?
- How do we render block polygons accurately on the map?

## 11. Tech Stack

Working assumption: Python backend, JS/TS frontend with Leaflet or Mapbox.
