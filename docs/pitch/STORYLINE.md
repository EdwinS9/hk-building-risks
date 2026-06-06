# Storyline for the Pitch & Deck

This file is the single source of truth for our pitch: the narrative (Part 1), a
slide-by-slide deck sketch (Part 2), production notes and claims to verify
(Part 3), and a Q&A credibility appendix. It is also what we feed to Claude to
generate the PowerPoint.

> **Working product name:** *placeholder*. Suggestions: *Sentinel*, *Triage*,
> *BuildSight*, *Aegis HK*. Pick one before recording.

**Numbers policy.** Two kinds of figures appear here:

- **Repo numbers** (model metrics, ingestion counts) are real and reproducible
  from the code, so they are safe to put on a slide as-is.
- **Policy / cost numbers** are sourced to `Legal/MBIS Inspection.md` and
  `Data Analysis/Building ressource overview.md`; they are kept because they land
  hard, with the source noted. A short list still needs checking before the deck
  goes live (98% CV claim, the Wang Fuk Court framing, the falling-concrete
  count). Those carry a ⚠️ and live in Part 3.

---

## Part 1 | The narrative

### 1. The issue: Hong Kong's building-inspection bottleneck

Hong Kong has one of the oldest, densest building stocks in the world, and it
keeps ageing faster than it can be inspected.

**The scale.** Roughly **50,000 buildings**; about **30,000 are 30+ years old**
(~60% of the stock) and close to **10,000 are past 50** (source: surveyors'
institute / government, `Building ressource overview.md`). In our own ingested
records the picture is the same: of 51,037 buildings, **34,908 are 30+** and
**12,162 are past 50**, with a median age of 44 in the at-risk cohort.

**The law.** The Mandatory Building Inspection Scheme (MBIS) gives one criterion:
buildings **30+ years** must be inspected by a licensed Registered Inspector
**once every 10 years**. That single rule sweeps in a huge cohort with no way to
rank inside it. Mechanically the load is the eligible pool over ten, about
**2,400 to 2,600 mandatory inspections a year**, and each one costs owners
**HK$50,000 to HK$200,000** before a single repair is made
(`MBIS Inspection.md`, `Building ressource overview.md`).

**The gap is capacity, not law.** The Buildings Department actually selects only
**~2,000 buildings a year, and that number is falling**, already below the legal
requirement. The Audit Commission found **~12,000 buildings never even
selected** by end-2019, and at that pace it takes **~20 years just to clear the
backlog**, with hundreds of notices left outstanding **5+ years**
(`MBIS Inspection.md` §1). Every building in the bucket looks equally urgent on
paper, so authorities cannot tell which of the old buildings are actually
deteriorating versus merely old.

**The needle.** In our data, only **1,998 buildings (5.7%)** of the 30+ cohort
carry a statutory inspection/repair notice. The genuinely high-risk blocks are a
**1-in-18 needle**, and age alone cannot point to them.

**The stakes.** This is money and lives. The repair, maintenance, alteration and
addition (RMAA) sector runs at **HK$93.1 billion a year, 34.3% of all
construction** (`Building ressource overview.md`). And the failure mode is real:
the **Wang Fuk Court fire in November 2025 killed 168 people** ⚠️ (see Part 3 for
the careful framing). The gap is not "should we inspect old buildings." It is
"which ones first, and how do we make the first look cheap."

### 2. Our solution: a triage layer in front of the inspection system

We do not replace the licensed inspector or the statutory inspection. We sit
**upstream of it** and answer the two questions capacity can't: *which building
first*, and *how do we look without sending a person to every one*. Two pillars:

- **Pillar A | Prioritise.** Fuse building data with satellite radar to rank
  every block by risk, so inspectors go to the worst first instead of working an
  arbitrary age queue.
- **Pillar B | Screen cheaply.** Make the first visual look near-free: residents'
  phones for interiors, drones for facades, and an edge computer-vision model
  that auto-flags cracks and spalling, doing the Tier-1 visual screening that
  used to need a person on site for every building.

Under the hood this is three working stages, each backed by code and real data.

#### Stage 1 | Prioritise: a risk engine that ranks inside the 30+ cohort

We score every building on a **0 to 100** risk scale. The score combines:

- **Satellite radar ground motion (InSAR).** 117 Sentinel-1 interferograms over
  Hong Kong, processed into line-of-sight velocity and a 0 to 100 subsidence
  gradient score, with a usable ground-motion signal on **7,885 buildings**
  (15.4% of the stock, wherever the radar stays coherent). This is the
  differentiator: millimetre-scale ground and structural movement that no age
  field or paper record can capture, measured from space at zero marginal cost
  per building, and it flags movement **regardless of building age**.
- **Building fundamentals.** Age, height/storeys, use class, structure type and
  district, joined across the official Buildings Department records and Lands
  Department footprints.

It is trained and validated against ground truth, not hand-waved:

- **51,037 buildings** (BD Building Information and Age Records) as the spine.
- **2,056 statutory inspection/repair notices** as labels, joining exactly to
  the building records.
- **342,350 building footprints with heights** (CSDI / Lands Dept), matching
  99.9% of the building stock.
- The model trains only on the 30+ cohort (34,908 buildings, 1,998 positives,
  5.7% base rate), because that is the population the law targets, so it learns
  to separate risk *within* the at-risk group rather than relearning "old equals
  flagged."

Measured result (held-out 20% test split, reproducible from
`model/train_baseline.py`): the ranker reaches **13.4% precision at the top 500**
against a 5.7% base rate, a **2.3x lift**. InSAR pushes the very top of the list:
turning the feature on lifts top-100 precision from **7.0% to 8.0%** (1.2x to
1.4x), exactly where a dispatcher looks first.

#### Stage 2 | Triage: the operator dashboard (the product authorities use)

The risk engine feeds a real, government-facing web dashboard. This is what an
inspector or regulator opens every morning.

- **Risk map of Hong Kong.** All 51,037 blocks colour-coded by score (Low,
  Moderate, High, Critical), rendered with MapLibre and tuned to handle tens of
  thousands of points smoothly. The scores genuinely spread the cohort, from 0.3
  to 93.5 on the 0 to 100 scale, instead of bunching every old block together.
- **Triage queue.** Search, sort by score / name / district, and filter by risk
  band and inspection status. The worst blocks surface at the top by default.
- **Click to drill in.** A detail panel shows the score, the sub-factor
  breakdown (why this block scored high), block metadata and a recommended
  action. Scores older than 14 days are flagged as stale.
- **Close the loop.** Mark a block Scheduled or Inspected, keep a shared note,
  and track everything through the Inspected Log and Schedule views.
- **Real backend.** React + TypeScript + Vite frontend, Supabase (Postgres +
  Auth) backend, invite-only access with row-level security. It is a deployable
  product, not a mockup.

This feeds straight into BD's existing risk-based Building Score System: the
score re-ranks which of the ~12,000 unselected buildings to notice first.

#### Stage 3 | Inspect: drone- and phone-captured crack detection at the edge

Once the dashboard says *where* to inspect, the visual screening is still the
slow, costly part. We make it near-free with a computer-vision model small enough
to run on a drone or a phone.

- **3-class crack classifier** (EfficientNet-B0): clean surface, facade crack,
  asphalt/road crack. A full photo is scored by sliding a window over it,
  producing a colour-coded crack heatmap and the % of surface flagged.
- **Edge-ready.** 4.0M parameters, ~16 MB, ~40 ms per patch on CPU. It runs on a
  laptop, a phone, or a drone payload with no datacentre in the loop.
- **Accurate.** **99.3% test accuracy and 0.992 macro F1** on a held-out split,
  trained on ~24,000 labelled patches from two open crack datasets (Ozgenel
  concrete + CRACK500 pavement). This is measured on open data, not HK facades
  yet (see roadmap and Part 3).
- **Live demo.** A drag-and-drop web app: drop a drone or phone photo, get the
  crack heatmap, the dominant crack type, and the cracked-surface percentage.
  Judges can run it from their own phone.

These map to MBIS **Tier 1** (visual screening: cracks, spalling, exposed rebar),
which is exactly the failure mode behind recent falling-concrete incidents. We
stay on the right side of the law: the tool gives *presence + rough severity* and
feeds the RI, it does not issue the certified Tier-2 grade.

**Honest framing on satellite vs drone (a strength):** we evaluated detecting
cracks directly from satellite imagery and ruled it out. Cracks are 0.1 to 20 mm
wide; the best commercial optical resolution is ~30 cm, which is 90 to 900x too
coarse, and facades are near-invisible from nadir. No published work does true
crack detection from satellite. So the viable modality for cracks is drone /
close-range imagery (~1 mm/px), which is what our model is built for. Satellite
radar (InSAR) does the wide-area prioritisation; drone and phone optical does the
on-site defect detection. Each tool is used where it actually works.

### 3. The loop and the impact

Put together, the pillars form a closed loop:

1. The risk engine ranks the 30+ stock from satellite radar + building data.
2. The dashboard surfaces the worst blocks and dispatches an inspection.
3. A drone or phone captures close-range imagery; the edge model auto-flags
   cracks.
4. The result is logged back into the dashboard, feeding BD's Building Score
   System, and the licensed inspector goes where it matters.

Why it matters for the government:

- **Fewer wasted inspections.** Buildings are inspected when the data flags them,
  not just because they crossed an age line. The same budget covers the real risk
  first, against inspections that cost HK$50k to HK$200k each.
- **Early warning beyond the age line.** InSAR flags buildings that are moving
  today even if they are not yet 30, which no age-based queue can do.
- **Higher throughput, same headcount.** Drone + phone + edge CV collapses the
  cost of the Tier-1 visual look, so annual screening capacity rises against the
  ~20-year backlog without proportional headcount.
- **One source of truth.** A single operator view from risk score to dispatch to
  inspection outcome, replacing disconnected datasets and paper records.

Same inspectors. Same law. A fraction of the wasted trips.

### Roadmap (beyond the hackathon)

- Fold in environmental sub-factors already scoped (fire-service notices,
  rainfall/flood, slope/landslip) as additional risk layers.
- Add a coarse satellite road-condition prioritisation layer to route repair
  crews at city scale.
- Fine-tune the crack model on HK-captured drone imagery for facades and roads,
  to move the 99.3% from open data onto HK ground truth.

---

## Part 2 | Slide deck sketch

12 slides, mirroring the narrative, data-first (no fire-led opening). One idea per
slide, numbers large, text minimal. **Speaker notes hold the caveats** for any
flagged figure.

**Slide 1 | Title**
- *Purpose:* set the frame in 5 seconds.
- *Content:* product name + tagline ("Send inspectors where they're needed,
  first").
- *Visual:* the colour-coded HK risk map, full-bleed, dark overlay, white type.
- *Notes:* lead with the product and the map, not a tragedy. Stakes come on
  Slide 5.

**Slide 2 | The Scale**
- *Purpose:* size the problem.
- *Content:* three stat blocks: **~50,000** buildings, **~30,000** aged 30+
  (60%), **~10,000** aged 50+.
- *Visual:* icon grid of buildings, 60% shaded.
- *Notes:* public/surveyor figures. Our exact ingested counts (51,037 / 34,908 /
  12,162) appear on Slide 9.

**Slide 3 | The Law**
- *Purpose:* show the mandatory, recurring demand.
- *Content:* "Buildings 30+: a licensed inspection **every 10 years**, by law."
  Derived load **~2,500 inspections/year required**; inspection fee
  **HK$50k to HK$200k per building** before repairs.
- *Visual:* cycle diagram (30 yrs to notice to inspect, repeat every 10 yrs).
- *Notes:* fee scale and load from `MBIS Inspection.md` and `Building ressource
  overview.md`.

**Slide 4 | The Gap (core problem)**
- *Purpose:* supply can't meet demand.
- *Content:* **~2,000/yr selected, and falling** vs ~2,500 required;
  **~12,000 never selected**; **~20 years** to clear the backlog; notices
  outstanding **5+ years**.
- *Visual:* backlog bar overshooting a "10-year cycle" line; big "~20 yrs"
  callout.
- *Notes:* Audit Commission end-2019 finding (`MBIS Inspection.md` §1). MWIS
  parallel is ~24 yrs at 600/yr; cite the scheme it belongs to.

**Slide 5 | The Stakes**
- *Purpose:* connect the backlog to failure and cost.
- *Content:* Wang Fuk Court fire (168 dead, Nov 2025) ⚠️; falling-concrete
  incidents since 2023 ⚠️; RMAA repair sector **HK$93.1B/yr (34.3% of
  construction)**.
- *Visual:* sober incident image + the cost figure. Not sensational.
- *Notes:* see Part 3 for the careful Wang Fuk framing and the incident count.

**Slide 6 | Our Solution (overview)**
- *Purpose:* the two-pillar product in one frame.
- *Content:* "**A triage layer in front of the inspection system.**" Pillar A is
  **Prioritise** (fuse data + satellite radar to rank); Pillar B is **Screen
  cheaply** (phone + drone + CV for the first visual look).
- *Visual:* two columns feeding into "then the licensed inspector goes where it
  matters."
- *Notes:* always say augment / triage / screen, never replace the statutory
  inspection.

**Slide 7 | Pillar A: Prioritise (the risk engine + map)**
- *Purpose:* prove the ranking is data-driven and novel.
- *Content:* inputs are building age/use, statutory-notice history, and **InSAR
  ground motion (Sentinel-1)** detecting mm/yr movement regardless of age.
  Output is a 0 to 100 score per building. Result: **13.4% precision@500, 2.3x
  lift**; InSAR lifts top-100 precision **7.0% to 8.0%**.
- *Visual:* the colour-coded HK risk map + click-to-detail panel.
- *Notes:* metrics reproducible from `model/train_baseline.py`.

**Slide 8 | Pillar B: Cheap Tier-1 Screening (drone + phone + CV)**
- *Purpose:* show the cost collapse on the visual look.
- *Content:* phones capture interiors, drones capture facades, CV flags cracks /
  spalling / road damage. **EfficientNet-B0, 99.3% test accuracy, 0.992 macro
  F1, ~16 MB, edge-capable.**
- *Visual:* phone photo + drone shot with CV crack heatmaps.
- *Notes:* 99.3% is on open datasets (Ozgenel + CRACK500), not HK facades yet.
  Do **not** use the unverified "98%" target from the old draft.

**Slide 9 | Proof / Traction (we built this)**
- *Purpose:* de-risk; not vapourware.
- *Content:* **51,037** buildings ingested, **2,056** notice labels joined,
  **342,350** footprints with height, **117** Sentinel-1 interferograms,
  ground-motion signal on **7,885** blocks. Working dashboard (React + Supabase +
  MapLibre, auth + RLS) and a live crack-CV demo.
- *Visual:* live map screenshot + a data-pipeline strip.

**Slide 10 | Value (the funnel)**
- *Purpose:* crystallise the payoff.
- *Content:* four wins: early signal for **under-30** buildings, smart **triage
  of 30+**, near-free **Tier-1** screening, fewer expensive **Tier-2** physical
  inspections (at HK$50k to HK$200k each).
- *Visual:* funnel: 50,000 buildings narrowing to a small red "send a human" set.

**Slide 11 | Positioning & Who Pays**
- *Purpose:* adoptable and legally safe.
- *Content:* "**Augments the licensed inspector; we don't replace the statutory
  inspection.**" Feeds BD's existing Building Score System. Buyer: Buildings
  Department / government; beneficiaries: owners (lower wasted cost), public
  (safety).
- *Visual:* placement diagram with our layer **upstream** of the legally locked
  statutory inspection.
- *Notes:* defensible wedge is prioritisation upstream of the certified
  inspection (`MBIS Inspection.md` §3).

**Slide 12 | Close / Ask**
- *Purpose:* memorable last line + the ask.
- *Content:* "Same inspectors. Same law. A fraction of the wasted trips." + ask
  (pilot with BD on one district / access to notice + incident data).
- *Visual:* product name, tagline, contact.

---

## Part 3 | Production notes, sources & claims to verify

**Production notes**

- **Two pillars, one story.** Every slide ladders back to "decide which building
  to check first." Cut anything that doesn't.
- **Lead with the map.** The colour-coded map is the strongest asset; show it on
  Slide 1 and let it linger.
- **Stay on the right side of the law.** Always say augment / triage / screen,
  never replace the statutory inspection (`MBIS Inspection.md` §3).

**Sourced figures (safe to use, source noted in the slide notes)**

- ~50,000 buildings, ~30,000 aged 30+, ~10,000 aged 50+
  (`Building ressource overview.md`).
- ~2,500/yr required, ~2,000/yr selected and falling, ~12,000 never selected,
  ~20-yr backlog, notices 5+ yrs (`MBIS Inspection.md` §1).
- Inspection fee HK$50k to HK$200k/building; RMAA HK$93.1B/yr (34.3% of
  construction) (`Building ressource overview.md`).
- All model and ingestion numbers (see Appendix) reproducible from the repo.

**Claims to verify before recording**

- ⚠️ **"98% CV accuracy"** from the old draft is an unproven target. Replaced by
  our measured **99.3%** on open datasets; do not present it as HK-facade
  accuracy.
- ⚠️ **"168 dead / inspected 16 times."** The 16 checks were Labour Department
  site-safety checks of the renovation, not MBIS structural inspections. Phrase
  so it is accurate, or drop the "16 times" line.
- ⚠️ **Falling-concrete incident count** ("≥18 since July 2023" in
  `MBIS Inspection.md` §3). Confirm the exact count and date before it goes on a
  slide.
- ⚠️ **Backlog "~20 years"** is the end-2019 Audit Commission MBIS finding; the
  parallel MWIS figure is ~24 years at 600/yr. Cite the scheme it belongs to.

---

## Appendix: what is real today (for Q&A credibility)

- InSAR pipeline: 117 Sentinel-1 interferograms to LOS velocity to a 0 to 100
  subsidence gradient score, signal on 7,885 buildings (`insar/`, `model/`).
- Risk ranker: trained on 51,037 buildings + 2,056 statutory notices, 30+ cohort
  (34,908 buildings, 1,998 positives, 5.7% base rate), 13.4% precision@500
  (2.3x lift); InSAR lifts top-100 precision 7.0% to 8.0%
  (`model/train_baseline.py`).
- Dashboard: React + TS + MapLibre + Supabase, auth + RLS, map / triage queue /
  detail / schedule / inspected log (web app branch).
- Crack CV: EfficientNet-B0, 99.3% test accuracy, 0.992 macro F1, 16 MB,
  edge-capable, Gradio demo (`cracks/`).
