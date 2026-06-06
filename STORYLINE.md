# Storyline for the Pitchdeck

This file contains the storyline that shapes our pitch and pitchdeck. It will
also be used to generate the PowerPoint with Claude.

Structure: problem first, then the end-to-end solution (prioritise, triage,
inspect), then impact. Numbers in this doc are real and come from the repo, so
they are safe to put on a slide.

---

## 1. The Issue: Hong Kong's building inspection bottleneck

Hong Kong has one of the oldest, densest building stocks in the world. Tens of
thousands of blocks are past the age where deterioration becomes a public-safety
risk, and the stock keeps ageing faster than it can be inspected.

The law (the Mandatory Building Inspection Scheme) gives only one criterion:
buildings roughly 30+ years old must be inspected. That single rule sweeps in a
huge cohort with no way to rank inside it. Every building in the bucket looks
equally urgent on paper.

So inspection today is slow and expensive:

- There is no intelligent prioritisation. Authorities cannot tell which of the
  30+ year buildings are actually deteriorating versus merely old.
- Inspections are manual and labour-intensive, which caps how many can be done
  per year against a backlog that keeps growing.
- Resource is spread thin and partly wasted on buildings that did not need
  attention yet, while genuinely high-risk blocks wait in the same queue.

The gap is not "should we inspect old buildings." It is "which ones first, and
how do we inspect them faster."

---

## 2. Our solution: an end-to-end tool suite for government inspection

We built the full chain a government inspection authority actually needs, from
deciding where to look to capturing the defect on site. Three stages, each
backed by working code and real data.

### Stage 1 | Prioritise: a risk engine that ranks inside the 30+ cohort

We score every building on a 0 to 100 risk scale so authorities inspect the
worst first instead of inspecting in arbitrary order.

The score combines:

- **Satellite radar ground motion (InSAR).** 117 Sentinel-1 interferograms over
  Hong Kong, processed into line-of-sight velocity and a 0 to 100 subsidence
  gradient score. This is the differentiator: millimetre-scale ground and
  structural movement that no age field or paper record can capture, measured
  from space at zero marginal cost per building.
- **Building fundamentals.** Age, height/storeys, use class, structure type and
  district, joined across the official Buildings Department records and Lands
  Department footprints.

It is trained and validated against ground truth, not hand-waved:

- **51,037 buildings** (BD Building Information and Age Records) as the spine.
- **2,056 statutory inspection/repair notices** as labels, joining exactly to
  the building records.
- **342,350 building footprints with heights** (CSDI / Lands Dept), matching
  99.9% of the building stock.
- The model trains only on the 30+ cohort (~34,900 buildings, ~5.7% flagged),
  because that is the population the law actually targets, so it learns to
  separate risk *within* the at-risk group rather than relearning "old equals
  flagged."

Measured result: the ranker reaches **~12% precision at the top 500** against a
~5.7% base rate, a **2.1x lift**. InSAR is what pushes the very top of the list
(the top 100), which is exactly where a dispatcher looks first.

### Stage 2 | Triage: the operator dashboard (the product authorities use)

The risk engine feeds a real, government-facing web dashboard. This is what an
inspector or regulator opens every morning.

- **Risk map of Hong Kong.** Every block colour-coded by score (Low, Moderate,
  High, Critical), rendered with MapLibre and tuned to handle tens of thousands
  of points smoothly.
- **Triage queue.** Search, sort by score / name / district, and filter by risk
  band and inspection status. The worst blocks surface at the top by default.
- **Click to drill in.** A detail panel shows the score, the sub-factor
  breakdown (why this block scored high), block metadata and a recommended
  action. Scores older than 14 days are flagged as stale.
- **Close the loop.** Mark a block Scheduled or Inspected, keep a shared note,
  and track everything through the Inspected Log and Schedule views. The
  dashboard reacts immediately.
- **Real backend.** React + TypeScript + Vite frontend, Supabase (Postgres +
  Auth) backend, invite-only access with row-level security. It is a deployable
  product, not a mockup.

This turns the risk score into a daily workflow: open the map, sort by risk,
click the worst block, dispatch a team, log the outcome.

### Stage 3 | Inspect: drone-mounted crack detection at the edge

Once the dashboard says *where* to inspect, the inspection itself is still the
slow, costly part. We make it faster with a computer-vision model small enough
to run on a drone.

- **3-class crack classifier** (EfficientNet-B0): clean surface, facade crack,
  asphalt/road crack. A full photo is scored by sliding a window over it,
  producing a colour-coded crack heatmap and the % of surface flagged.
- **Edge-ready.** 4.0M parameters, ~16 MB, ~40 ms per patch on CPU. It runs on a
  laptop or a drone payload with no datacentre in the loop.
- **Accurate.** 99.3% test accuracy and 0.992 macro F1 on a held-out split,
  trained on ~24,000 labelled patches from two open crack datasets (Ozgenel
  concrete + CRACK500 pavement).
- **Live demo.** A drag-and-drop web app: drop a drone or phone photo, get the
  crack heatmap, the dominant crack type, and the cracked-surface percentage.
  Judges can run it from their own phone.

Drones flying this model replace much of the manual close-range inspection,
cutting the time and cost per building and letting one team cover far more
ground.

**Honest framing on satellite vs drone (important, and a strength):** we
evaluated detecting cracks directly from satellite imagery and ruled it out.
Cracks are 0.1 to 20 mm wide; the best commercial optical resolution is ~30 cm,
which is 90 to 900x too coarse, and facades are near-invisible from nadir. No
published work does true crack detection from satellite. So the viable modality
for cracks is drone / close-range imagery (~1 mm/px), which is what our model is
built for. Satellite radar (InSAR) does the wide-area prioritisation; drone
optical does the on-site defect detection. Each tool is used where it actually
works. (A coarse satellite road-condition screening layer remains a legitimate
optional add-on to the ranker, but it is prioritisation, not crack detection.)

---

## 3. The loop and the impact

Put together, the three stages form a closed loop:

1. The risk engine ranks the 30+ stock from satellite radar + building data.
2. The dashboard surfaces the worst blocks and dispatches an inspection.
3. A drone captures close-range imagery; the edge model auto-flags cracks.
4. The result is logged back into the dashboard, and the maintenance authority
   takes over for repair.

Why it matters for the government:

- **Fewer wasted inspections.** Buildings are inspected when the data flags
  them, not just because they crossed an age line. The same budget covers the
  real risk first.
- **Higher throughput.** Drone + edge CV cuts the manual hours per building, so
  the annual inspection capacity goes up without proportional headcount.
- **One source of truth.** A single operator view from risk score to dispatch to
  inspection outcome, instead of disconnected datasets and paper records.

### Roadmap (beyond the hackathon)

- Fold in environmental sub-factors already scoped (fire-service notices,
  rainfall/flood, slope/landslip) as additional risk layers.
- Add a coarse satellite road-condition prioritisation layer to route repair
  crews at city scale.
- Fine-tune the crack model on HK-captured drone imagery for facades and roads.

---

## Appendix: what is real today (for Q&A credibility)

- InSAR pipeline: 117 Sentinel-1 interferograms → LOS velocity → 0 to 100
  subsidence gradient score (`insar/`, `model/`).
- Risk ranker: trained on 51,037 buildings + 2,056 statutory notices, 30+
  cohort, ~12% precision@500 (2.1x lift) (`model/train_baseline.py`).
- Dashboard: React + TS + MapLibre + Supabase, auth + RLS, map / triage queue /
  detail / schedule / inspected log (web app branch).
- Crack CV: EfficientNet-B0, 99.3% test accuracy, 16 MB, edge-capable, Gradio
  demo (`cracks/`).
