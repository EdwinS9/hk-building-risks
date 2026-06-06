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

**Confirmed and in use (verified, no auth):**

- **Buildings (DS1):** BD "Building Information and Age Records", 51,037 buildings with lat/lon, occupation-permit date (age), use class, structure type, district. The spine.
- **Labels (DS2):** BD "Statutory Notices on prescribed inspection/repair", 2,056 notices with coordinates. Joins exactly to DS1 (0 m). 2,029 positive buildings (3.98%).
- **Footprints + height (CSDI):** Lands Dept "Building" layer `landsd_rcd_1637211194312_35158`, 342,350 polygons with `TopHeight`/`BaseHeight`/`Storeys`. ArcGIS REST bbox query (GeoJSON, EPSG:4326, paginated 3000/page) or ~397 MB full file. 99.9% of DS1 buildings matched a footprint. Pulled by `model/fetch_heights.py`.
- **InSAR (ASF HyP3):** Sentinel-1 burst `011_021606_IW3`, 61 dates 2020 to 2021, processed to LOS velocity via MintPy. See `insar/`.

**Candidate / not yet integrated:**

- Fire Services Department notices (fire sub-factor).
- Weather / flooding / slope (HKO rainfall, DSD flood, GEO landslip) data.

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

### Training cohort: 30+ years only (locked)

The model trains and scores ONLY on buildings aged 30 or more years. The DS2 label (statutory inspection/repair notices) is MBIS-driven, and MBIS only targets buildings 30+ years old, so the positive rate is ~0% under 30, 0.9% at 30 to 40, 5% at 40 to 50, and ~12% at 50+. Training on the full 51k stock just relearns "old equals flagged" and drowns the features that carry real signal (InSAR subsidence, use class, structure, district). Restricting to the 30+ cohort (~34,900 buildings, ~5.7% positive) makes the model separate within the at-risk group, which is where the InSAR edge matters. Baseline so far (age + use + structure + district, no InSAR): test PR-AUC 0.14, precision@500 of 12% (2.1x lift), but only ~1x lift at the top 100, which is the gap InSAR should close. Implemented in `model/train_baseline.py` (constant `MIN_AGE`).

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
