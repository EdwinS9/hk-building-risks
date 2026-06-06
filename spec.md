# HK Building Risk Assessment | Spec

A building risk assessment model and application built for the Hong Kong tech hackathon. The system scores and surfaces structural, fire, and environmental risk for buildings across Hong Kong to help inspectors, owners, and the public prioritise attention.

> Status: v0 draft. This is a living document. Sections marked `TODO` are placeholders to fill in as we iterate.

## 1. Problem

Hong Kong has a large stock of ageing high-density buildings. Risk signals (unauthorised building works, water seepage, fire-safety defects, structural deterioration) are spread across disconnected government datasets and inspection records. There is no single view that ranks buildings by risk to guide where limited inspection resources should go.

## 2. Goals

- Produce a per-building risk score from available open data.
- Explain *why* a building scores the way it does (feature contributions).
- Provide a map and search UI to explore and filter buildings by risk.
- Be reproducible and demoable within the hackathon timebox.

### Non-goals (v1)

- Real-time sensor ingestion.
- Legal or regulatory determinations.
- Coverage outside Hong Kong.

## 3. Users

- **Inspectors / regulators**: triage which buildings to inspect next.
- **Building owners / management**: understand and reduce their building's risk.
- **Public**: look up a building's risk before renting or buying.

## 4. Data Sources

`TODO`: confirm and list with licences and refresh cadence. Candidates:

- HK Buildings Department records (UBW orders, inspection notices).
- Rating and Valuation Department building attributes (age, use, storeys).
- Geospatial / address lookup (e.g. Lands Department, OpenStreetMap).
- Fire Services Department notices.
- Weather / flooding / slope (GEO landslip) data.

## 5. Risk Model

`TODO`: define scope. Initial direction:

- **Features:** building age, height/storeys, use class, historical orders/notices, density, proximity to slopes, last inspection date.
- **Approach v1:** transparent weighted scoring (explainable baseline).
- **Approach v2:** supervised model (e.g. gradient boosting) trained on historical incident/order labels, with SHAP-style explanations.
- **Output:** 0 to 100 risk score, plus categorical band (Low / Medium / High), plus top contributing factors.

### Evaluation

`TODO`: define labels and metrics (e.g. ranking quality vs. historical orders, calibration). Hold out a test set.

## 6. Architecture

`TODO`. Initial sketch:

```
data sources -> ingestion / ETL -> feature store -> model -> API -> web app (map + search)
```

- **Backend / model:** Python (pandas, scikit-learn).
- **API:** REST endpoint serving scores and explanations by building ID / address.
- **Frontend:** map-based web UI with search and risk filters.

## 7. Milestones

- [ ] M0: Repo + spec (this).
- [ ] M1: Acquire and clean one core dataset; geocode buildings.
- [ ] M2: Baseline weighted risk score + CSV output.
- [ ] M3: API serving scores + explanations.
- [ ] M4: Map UI with search and filtering.
- [ ] M5: Demo polish + presentation.

## 8. Open Questions

- Which datasets are openly licensed and reliable enough to ship?
- What is the ground-truth label for "risk" (orders issued? incidents?)?
- Address/building matching across datasets: how do we join reliably?

## 9. Tech Stack

`TODO`: confirm. Working assumption: Python backend, JS/TS frontend with a mapping library (Leaflet / Mapbox).
