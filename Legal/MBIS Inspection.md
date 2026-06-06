# MBIS — Legal & Regulatory Findings

Findings on Hong Kong's **Mandatory Building Inspection Scheme (MBIS)**, the legal backbone for building-safety inspection of aged private buildings. Governed by the Buildings Ordinance and the Building (Inspection & Repair) Regulation; administered by the Buildings Department (BD). Full implementation since 30 June 2012.

---

## 1. The inspection cycle — what the regulation requires

- **Trigger:** BD serves a **statutory notice** on owners of buildings aged **30 years or above** (except domestic buildings **≤3 storeys**, which are exempt). Owners must then appoint a **Registered Inspector (RI)** to carry out the prescribed inspection and supervise any prescribed repairs (the latter done by a **Registered Contractor, RC**).
- **Frequency:** once every **10 years** per building (rolling re-inspection). The parallel **Mandatory Window Inspection Scheme (MWIS)** runs on a **5-year** cycle.
- **Legal actor:** the inspection is a regulated act **certified by a licensed RI who bears liability** for the report. It is not a casual look and cannot be discharged by an unlicensed party or an automated tool.
- **Selection is risk-based:** BD does not notice every eligible building each year. It picks **target buildings** via a **Building Score System** (factors: building condition, building management, risk to public, incident history such as fallen debris). Higher score = higher priority.

### Throughput vs. requirement (the structural gap)

The mandated annual load is essentially deterministic:

> **Required inspections / year ≈ eligible stock ÷ 10**
> (load scales with the *whole* eligible pool, not just buildings newly turning 30, because every building recurs on a 10-year clock.)

- Age **30+** eligible pool ≈ 24,000–26,000 → **~2,400–2,600/yr** required.
- Age **50+** (risk proxy, *not* a legal threshold) ≈ 10,000 today, ~14,000 by 2030 → ~1,000–1,400/yr.
- **Actual BD target has been ~2,000/yr and falling** — already below the 30+ legal requirement. Audit Commission found ~12,000 buildings not yet even selected by end-2019, and at that pace **~20 years just to clear the backlog**. Hundreds of notices outstanding 5+ years.

**Realized inspection throughput (actual completions):**

- **2019: ~7,400 building-inspection certificates** submitted by RIs to BD (of which 3,860 = 52% — the figure Audit sampled), vs. only **~607 building-repair certificates** the same year. Inspections completed far outpace completed repairs (the repair stage is the deeper bottleneck — owner cost/consent).
- The realized inspection rate (~7k/yr in 2019) **exceeds the ~2,000 annual selection target** because it includes catch-up on notices served in prior years; it is still short of fully clearing the standing backlog within one 10-year cycle.
- Rough reconciliation: legal requirement ≈ **2,500/yr** (30+ pool ÷ 10) · selection target ≈ **2,000/yr** · realized inspection completions ≈ **7,000/yr (2019)** · realized repairs ≈ **600/yr (2019)**.

**Predicting the load from age data:** first-order yes (`stock/10`), but age distribution *alone* over-states it. Accurate projection also needs (1) **building type + storey count** (to remove the ≤3-storey domestic exemption), (2) a **demolition/redevelopment outflow** (~160/yr) netted against (3) **inflow** (~510/yr aging into 50+). There is also a launch **transient**: a backlog of already-old buildings all became due at once in 2012, front-loading near-term load above steady state. The genuinely unpredictable variable is **compliance/throughput**, not the requirement.

---

## 2. Content of the inspection — what is examined

**Statutory scope:** common parts (excluding individual private premises), **external walls** (whether or not common parts), prescribed **projections** (balconies, verandahs, planter boxes, drying racks, window canopies, building-service supports/ducts), and **signboards**.

Five element categories (per Code of Practice for MBIS & MWIS 2012, 2023 Edition):

1. **External / physical elements** — external walls, fence walls, finishes (tiling, rendering, cladding), fins, grilles, louvers, parapets/railings/balustrades, curtain walls, skylights, awnings/canopies/appendages.
2. **Structural elements** — columns, beams, slabs, structural walls, staircases, cantilevered/transfer/hanging structures, exposed pile caps.
3. **Fire safety elements** — means of escape, fire-fighting/rescue access, fire-resisting construction.
4. **Drainage system** — at external walls, in common parts, in pipe ducts, underground/above-ground.
5. **Unauthorised building works (UBW)** — identification on exterior, roof, podium, adjoining slope, or street frontage.

**Two-tier method:**

- **Tier 1 — visual inspection:** identifies defects (cracks, concrete spalling, exposed/corroded rebar, defective finishes/tiling, water seepage, deformation, damaged/missing railings, UBWs).
- **Tier 2 — detailed investigation** (triggered by RI professional judgment): destructive + non-destructive testing. Concrete: hammer-tapping, rebound hammer, carbonation/chloride/cement-content tests, coring, crack survey. Reinforcement: covermeter survey, section-loss measurement, half-cell (electrochemical) potential.

---

## 3. Implications for triage / phone / external-data use case

**Where a phone/remote layer fits.** The system's actual pain is **prioritisation under scarce RI capacity against a ~20-year backlog**, not the final certified inspection. A phone-based tool should be positioned as a **screening / triage / monitoring aid that augments the RI and feeds BD's risk scoring — not a replacement for the statutory inspection.**

**What a phone camera plausibly *can* do (maps to Tier 1):**

- Detect visually-evident surface defects on external walls and projections — spalling, cracking, corroded rebar, loose/bulging finishes, water damage, visible UBWs. These are exactly the failure modes behind recent falling-concrete incidents (≥18 since July 2023) and a mature computer-vision problem.
- Act as structured data capture: geotagged, timestamped imagery feeding (a) BD's **Building Score System** to re-rank which of ~12,000 unselected buildings to notice first, (b) defect-progression tracking between 10-year cycles, and (c) pre-population of the RI's report.

**Hard limits (legal + physical) — do not overclaim:**

- **Tier 2 is inherently physical.** No camera equivalent for hammer-tapping, coring, covermeter, half-cell. Dangerous **subsurface** deterioration often has no visual signature.
- **Access:** high external walls, roofs, and projections need gondola/scaffold (or drones) — a resident's phone can't reach them; coverage biases to low walls, lobbies, stairwells.
- **Legal sign-off:** report must be certified by a liability-bearing RI; an automated tool cannot be the legal actor.
- **Quantitative grading:** crack-*width* severity thresholds need calibrated scale; uncontrolled phone distance/angle/lighting makes quantitative grading unreliable → tool gives *presence + rough severity*, not certified grades.
- **False-negative liability:** "the app said it looked fine" carries risk if something subsequently falls — design conservatively.

**External-data angle.** The triage/scoring case strengthens by fusing phone imagery with external datasets already implied by BD's scoring: building age/storey/use records (eligibility + exemption filtering), MBIS notice/order status and incident history, and remote-sensing signals (e.g. InSAR ground/structural movement) to flag buildings for human follow-up. The defensible product wedge = **early-warning + prioritisation that decides where to deploy scarce inspectors**, sitting upstream of the legally locked-down statutory inspection.

---

## Sources

- [MBIS overview — Buildings Department](https://www.bd.gov.hk/en/safety-inspection/mbis/index.html)
- [MBIS Scope and standards — Buildings Department](https://www.bd.gov.hk/en/safety-inspection/mbis/scope-and-standards/index.html)
- [Scope & Standard of Inspection and Repair — Buildings Department](https://www.bd.gov.hk/en/safety-inspection/mbis/registered-inspectors-and-registered-contractors/index_mbis_rirc_scope_inspection.html)
- [Code of Practice for MBIS & MWIS 2012 (2023 Ed.) — PDF](https://www.bd.gov.hk/doc/en/resources/codes-and-references/code-and-design-manuals/CoP_MBIS_MWISe.pdf)
- [Audit Commission Report Ch.9 — Management of MBIS (PDF)](https://www.aud.gov.hk/pdf_e/e75ch09.pdf)
- [LCQ15: Structural safety of old buildings (Nov 2023)](https://www.info.gov.hk/gia/general/202311/15/P2023111500283.htm)
- [China Daily HK — redevelopment ~160/yr, +510/yr aging, projections to 2043](https://www.chinadailyhk.com/hk/article/628085)
- [SCMP — half of 47 ageing buildings at 'immediate risk'](https://www.scmp.com/news/hong-kong/society/article/3231072/inspection-uncovers-half-47-ageing-hong-kong-buildings-immediate-risk-after-spate-cases-involving)
