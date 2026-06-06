# Pitch — HK Building Inspection Triage

> Working product name: **placeholder** — suggestions: *Sentinel*, *Triage*, *BuildSight*, *Aegis HK*. Pick one before recording.
>
> Sources for every figure below: `Legal/MBIS Inspection.md`, `Data Analysis/Building ressource overview.md`, `spec.md`. Numbers flagged ⚠️ should be double-checked against the source before the deck goes live (see "Claims to verify" at the end).

---

## Part 1 — 2-Minute Pitch Video Script

**Format:** single narrator (voiceover) over slides / screen-recording. ~300 spoken words ≈ 2:00 at a calm pace. Timestamps and on-screen visuals are cues, not spoken.

---

**[0:00–0:18] — The hook**

*[VISUAL: news footage / still of the Wang Fuk Court fire, then cut to a wall of cracked concrete facades.]*

> In November 2025, a fire at Wang Fuk Court killed 168 people. It started in netting on a building that had been "inspected" sixteen times. Hong Kong doesn't have an inspection problem because nobody looks — it has a problem because there are far too many buildings to look at, and no good way to decide which one to check first.

**[0:18–0:45] — The scale**

*[VISUAL: big numbers animating in — 50,000 / 30,000 / every 10 years.]*

> Hong Kong has around fifty thousand buildings. Thirty thousand of them are over thirty years old. By law, every one of those must be inspected by a licensed inspector once a decade. That's roughly twenty-five hundred mandatory inspections a year — and each one costs the owners fifty thousand Hong Kong dollars or more before a single repair is made.

**[0:45–1:05] — The gap**

*[VISUAL: a backlog bar filling far past a "10-year cycle" line; counter ticking to "~20 years".]*

> The Buildings Department only manages to select about two thousand buildings a year — and that number is falling. The audit office found twelve thousand buildings that had never even been picked. At today's pace, clearing the backlog takes twenty years. Some buildings have sat under an outstanding notice for more than five. The bottleneck isn't the law. It's capacity.

**[1:05–1:35] — The solution**

*[VISUAL: split screen. Left: a risk map of HK colour-coded red-to-green. Right: a phone photo of a crack with a CV bounding box.]*

> We built a triage layer that sits in front of the inspection system. We fuse building age, statutory-notice history, and satellite radar — InSAR from Sentinel-1 — to detect millimetre-scale ground and structural movement. That tells the Buildings Department which buildings are actually moving, today, regardless of age. Then we make the first look cheap: residents photograph interiors with their phones, drones capture the facades, and a computer-vision model flags cracks and spalling automatically — doing the visual screening that used to need a person on site for every building.

**[1:35–1:58] — The value**

*[VISUAL: a funnel — 50,000 buildings narrowing to a small set of "send a human" red dots.]*

> The result: early warning for buildings that aren't even thirty yet, smart ranking of the ones that are, near-free visual screening, and far fewer expensive physical inspections. We don't replace the licensed inspector — we tell them where to go first.

**[1:58–2:00] — Close**

*[VISUAL: product name + one line.]*

> Same inspectors. Same law. A fraction of the wasted trips.

---

## Part 2 — Slide Deck Sketch (slide-level descriptions)

12 slides, built to mirror the script. Each slide below lists its **purpose**, **on-slide content**, and **visual**. Keep one idea per slide; numbers large, text minimal.

---

**Slide 1 — Title / Hook**
- *Purpose:* land the emotional stakes in 5 seconds.
- *Content:* Product name + tagline ("Send inspectors where they're needed — first"). One line: "168 dead at Wang Fuk Court. The building had been inspected 16 times."
- *Visual:* full-bleed fire/facade photo, dark overlay, white type.

**Slide 2 — The Scale**
- *Purpose:* establish the size of the problem.
- *Content:* three stat blocks — **~50,000** buildings · **~30,000** aged 30+ (60%) · **~10,000** aged 50+.
- *Visual:* icon grid of buildings, 60% shaded to show the aged share.

**Slide 3 — The Law**
- *Purpose:* show the mandatory, recurring demand.
- *Content:* MBIS in one line — "Buildings 30+ years: a licensed inspection **every 10 years**, by law." Derived load: **~2,500 inspections/year required**. Inspection cost **HK$50k–200k per building** (before repairs).
- *Visual:* simple cycle diagram (30 yrs → notice → inspect → repeat/10yrs).

**Slide 4 — The Gap (the core problem)**
- *Purpose:* the punchline — supply can't meet demand.
- *Content:* **~2,000/yr actually selected, and falling** vs. ~2,500 required. **~12,000 buildings never selected.** **~20 years** to clear the backlog. Notices outstanding **5+ years**.
- *Visual:* backlog bar overshooting a "10-year cycle" line; big "~20 yrs" callout.

**Slide 5 — The Stakes**
- *Purpose:* connect backlog to real-world failure + cost.
- *Content:* Wang Fuk Court fire (168 dead, Nov 2025) · ⚠️ ≥18 falling-concrete incidents since July 2023 · Ma Tau Wai collapse (2010). Cost angle: RMAA repair sector **HK$93.1B/yr** (34% of all construction).
- *Visual:* incident photo strip + a cost figure; sober, not sensational.

**Slide 6 — Our Solution (overview)**
- *Purpose:* introduce the two-part product in one frame.
- *Content:* "**A triage layer in front of the inspection system.**" Two pillars: **(1) Prioritise** — fuse data + satellite radar to rank buildings; **(2) Screen cheaply** — phone + drone + computer vision for the first visual look.
- *Visual:* two-column diagram feeding into "→ licensed inspector goes where it matters."

**Slide 7 — How It Works: Triage / Prioritisation**
- *Purpose:* prove the ranking is data-driven and novel.
- *Content:* inputs — building age & use, statutory-notice history (DS2), and **InSAR ground-motion velocity (Sentinel-1)** detecting mm/yr movement regardless of building age. Output — a 0–100 priority score per building.
- *Visual:* the colour-coded HK risk map (red→green), with a click-to-detail panel mock.

**Slide 8 — How It Works: Cheap Tier-1 Screening**
- *Purpose:* show the cost collapse on the visual inspection.
- *Content:* residents' phones capture interiors · drones capture facades · CV model flags cracks / spalling / exposed rebar (⚠️ stated 98% detection accuracy). Automates the visual screening that previously required a person on site for **every** building.
- *Visual:* phone photo + drone shot, each with CV bounding boxes on defects.

**Slide 9 — Proof / Traction (we actually built this)**
- *Purpose:* de-risk — this isn't vapourware.
- *Content:* **51,037** buildings ingested (DS1) · **2,056** statutory-notice labels joined cleanly (DS2) · **342,350** footprints with height (CSDI) · **117** Sentinel-1 interferograms. Baseline model: **2.1× lift**, precision@500 ≈ 12% — before InSAR is even added.
- *Visual:* live map screenshot + a tiny "data pipeline" strip of logos/datasets.

**Slide 10 — Value Proposition (the funnel)**
- *Purpose:* crystallise the payoff.
- *Content:* four wins — early signal for **under-30** buildings · smart **triage of 30+** · near-free **Tier-1** screening · **fewer expensive Tier-2** physical inspections.
- *Visual:* funnel: 50,000 buildings → narrowing → a small red set of "send a human."

**Slide 11 — Positioning & Who Pays**
- *Purpose:* show it's adoptable and legally safe.
- *Content:* "**Augments the licensed inspector — we don't replace the statutory inspection.**" Feeds BD's existing risk-based Building Score System. Buyer: Buildings Department / government; beneficiaries: owners (lower wasted cost), public (safety).
- *Visual:* placement diagram — our layer **upstream** of the legally locked statutory inspection.

**Slide 12 — Close / Ask**
- *Purpose:* memorable last line + what we want.
- *Content:* "Same inspectors. Same law. A fraction of the wasted trips." + the ask (pilot with BD on one district / access to notice + incident data).
- *Visual:* product name, one-line tagline, contact.

---

## Production notes
- **Two pillars, one story:** every slide should ladder back to "decide which building to check first." Cut anything that doesn't.
- **Lead with the map.** The colour-coded map is the single most impressive asset — show it early (Slide 7) and let it linger in the video.
- **Stay on the right side of the law.** Always say *augment / triage / screen*, never *replace the statutory inspection*. The defensible wedge is prioritisation upstream of the certified inspection (see `Legal/MBIS Inspection.md` §3).

## Claims to verify before recording
- ⚠️ **98% CV accuracy** — currently a target in `Legal/Product Overview.md`, not yet measured on our data. Soften to "computer-vision crack detection" if unproven.
- ⚠️ **"168 dead / inspected 16 times"** — the 16 inspections were Labour Dept site-safety checks of the renovation, not MBIS structural inspections. Phrase carefully so it's accurate.
- ⚠️ **≥18 falling-concrete incidents since July 2023** — from the legal doc; confirm the count and date before putting it on a slide.
- ⚠️ **Backlog "~20 years"** is the end-2019 Audit Commission finding; the parallel MWIS figure is ~24 years at 600/yr. Make sure the slide cites the scheme it belongs to.
