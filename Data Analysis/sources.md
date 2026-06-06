# Data Sources

Candidate datasets for the HK Building Risk Assessment model. For each source: confirm licence, check data density/coverage, and test join reliability against Block IDs before committing to use.

> Legend — Status: ✅ Confirmed usable | 🔍 To investigate | ❌ Not available / unsuitable

---

## Buildings Department (BD)

Provider page: https://data.gov.hk/en-datasets/provider/hk-bd

### Building Information & Age Records
- **URL:** https://data.gov.hk/en-data/dataset/hk-bd-opendata-building-information
- **Content:** Address, building type, usage, Block ID, occupation permit date, occupation permit number for private buildings.
- **Relevance:** Core dataset — building age and Block ID are both critical inputs.
- **Status:** 🔍 Check coverage and whether Block IDs match our target join key.

### UBW Statutory Orders Issued (Section 24)
- **URL:** https://data.gov.hk/en-data/dataset/hk-bd-opendata-s24-order-1
- **Content:** Removal orders for unauthorised building works issued after 1 May 2023.
- **Relevance:** Direct signal for structural/safety risk.
- **Status:** 🔍 Note: only covers orders post-May 2023 — historical depth is limited.

### UBW Orders Complied / Withdrawn / Superseded
- **URL:** https://data.gov.hk/en-data/dataset/hk-bd-opendata-s24-order-2
- **Content:** Orders resolved after 1 May 2024.
- **Relevance:** Allows distinguishing outstanding risk from resolved issues.
- **Status:** 🔍

### MBIS Statutory Notices (Mandatory Building Inspection)
- **URL:** https://data.gov.hk/en-data/dataset/hk-bd-opendata-mbis-s30b-notice-1
- **Content:** Notices issued under the Mandatory Building Inspection Scheme (buildings ≥30 years old).
- **Relevance:** Proxy for building age and deferred maintenance risk.
- **Status:** 🔍

### Fire Safety Ordinance Compliance
- **URL:** https://data.gov.hk/en-data/dataset/hk-bd-opendata-fso
- **Content:** Cumulative compliance data under Fire Safety (Commercial Premises) Ordinance (Cap. 502) and Fire Safety (Buildings) Ordinance (Cap. 572).
- **Relevance:** Fire risk sub-factor.
- **Status:** 🔍

### GFA Concessions
- **URL:** https://data.gov.hk/en-data/dataset/hk-bd-opendata-gfa
- **Content:** Gross floor area concessions for private developments completed after August 2010; includes BEAM Plus certification and estimated energy performance.
- **Relevance:** Building density and energy/environmental factor.
- **Status:** 🔍 Lower priority.

---

## Rating and Valuation Department (RVD)

Provider page: https://data.gov.hk/en-datasets/provider/hk-rvd

### Names of Buildings
- **URL:** https://data.gov.hk/en-data/dataset/hk-rvd-tsinfo_rvd-names-of-buildings
- **Content:** Building names, addresses, year of completion. Updated quarterly.
- **Relevance:** Supplementary building metadata; may help with address-to-Block-ID matching.
- **Status:** 🔍

### Domestic Property Information (via RVD portal)
- **URL:** https://www.rvd.gov.hk/en/our_services/property_information.html
- **Content:** Saleable area, age, and permitted occupation purpose of domestic properties (excludes village houses).
- **Relevance:** Building age confirmation, use class.
- **Status:** 🔍 Check if this is available as bulk download or API rather than lookup-only.

---

## Fire Services Department (FSD)

Provider page: https://data.gov.hk/en-datasets/provider/hk-fsd

### Fire Protection and Prevention Targets (Building Inspection)
- **URL:** https://data.gov.hk/en-data/dataset/hk-fsd-fsd1-fsdfpptq
- **Content:** Inspection target and actual figures for building fire inspections. Updated quarterly.
- **Relevance:** Aggregate signal on fire inspection coverage — useful for calibration but may not be per-building.
- **Status:** 🔍 Check whether data is district/aggregate or per-building.

### Fire Service Indicators (Incident Related)
- **URL:** https://data.gov.hk/en-data/dataset/hk-fsd-fsd1-fsdfsi
- **Content:** Fire incident statistics.
- **Relevance:** Historical incident data for model training/evaluation.
- **Status:** 🔍 Check granularity (district vs. building).

### Fire Service Indicators (Fire Protection Related)
- **URL:** https://data.gov.hk/en-data/dataset/hk-fsd-fsd1-fsdfsiq
- **Content:** Fire protection performance indicators.
- **Status:** 🔍 Lower priority.

---

## Lands Department — Geospatial

### Building Footprint Polygons
- **URL:** https://data.gov.hk/en-data/dataset/hk-landsd-openmap-landsd-building
- **Content:** Building footprint polygons with building type, name, height.
- **Relevance:** Required for rendering buildings/blocks on the map with correct geometry.
- **Status:** 🔍 Critical for UI — confirm coordinate system and match against Block IDs.

### 3D Building Data
- **URL:** https://data.gov.hk/en-data/dataset/hk-landsd-openmap-development-hkms-digital-3d-bit00
- **Content:** 3D building models (all buildings > 4m² footprint).
- **Relevance:** Building height/storeys as a risk feature. May be overkill — check if 2D footprint data includes height attribute.
- **Status:** 🔍 Lower priority.

### HK GeoData Store
- **URL:** https://geodata.gov.hk/gs/
- **Content:** Central portal for all Lands Dept spatial open data.
- **Status:** 🔍 Browse for additional relevant layers (roads, land use, flood zones).

---

## Geotechnical Engineering Office (GEO / CEDD)

### GEO Open Data Portal
- **URL:** https://www.ginfo.cedd.gov.hk/geoopendata/
- **Content:** Geotechnical datasets including slope and landslip hazard data.
- **Relevance:** Proximity-to-slope and landslip risk sub-factor.
- **Status:** 🔍

### Slope Information System
- **URL:** https://hkss.cedd.gov.hk/hkss/en/facts-and-figures/slope-information-system/sis/index.html
- **Content:** Catalogue of ~61,000 registered slopes in HK with pertinent safety information.
- **Relevance:** Direct input for slope proximity risk feature.
- **Status:** 🔍 Check download availability (historically this has been browse-only).

---

## Water Seepage

### Joint Office Complaint Data
- **URL:** https://www.waterseepage.gov.hk/
- **Content:** The Joint Office (FEHD + BD) handles ~45,000+ water seepage complaints per year.
- **Relevance:** Water damage risk sub-factor.
- **Status:** ❌ No confirmed bulk download — data appears to be operational only. Follow up with BD open data plans to see if complaint statistics are published at building/block level.

---

## OpenStreetMap

- **URL:** https://download.geofabrik.de/asia/hong-kong.html
- **Content:** Building footprints, road network, amenities for Hong Kong. Open licence (ODbL).
- **Relevance:** Fallback/supplement for geospatial base layer and building geometry if Lands Dept data is restricted.
- **Status:** 🔍

---

## Open Questions

- [ ] Can BD Building Information records be joined to Lands Dept block polygons via Block ID? What format is the Block ID in each dataset?
- [ ] Are FSD incident/inspection datasets at building or district level?
- [ ] Is GEO slope data available as a bulk download or API, or browse-only?
- [ ] Is water seepage complaint data available at any spatial granularity?
- [ ] What is the licence on each confirmed dataset — are there restrictions on hackathon/commercial use?
