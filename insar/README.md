# InSAR pipeline (Sentinel-1 ground deformation)

Goal: a per-building line-of-sight subsidence velocity (mm/yr) feature, joined to
DS1 by OBJECTID. This is the project's differentiator.

## Chosen burst (from `find_bursts.py`, run against DS1 locations)

| burst | dir | path | dates | building coverage |
|-------|-----|------|-------|-------------------|
| **011_021606_IW3** | ascending | 11 | 61 (2020-01 to 2021-12) | **72.8%** |
| 011_021607_IW3 (add later) | ascending | 11 | 61 | +35% (contiguous, mergeable) |

## Steps

1. **Discover** (done, no auth): `python3 insar/find_bursts.py`
2. **Submit** (needs your Earthdata login): `pip install hyp3_sdk && python3 insar/submit_hyp3.py`
   - Builds a ~30-date small-baseline network over the burst (~55 jobs), tagged `hk_insar_011_021606_IW3`.
3. **Download** finished products: `python3 insar/download_hyp3.py` -> `insar/products/`
4. **Time series** (MintPy SBAS). Config: `insar/hk_insar.cfg` (HyP3 loader, AOI subset,
   reference pinned to Checkerboard Hill granite `22.3415,114.1862`). Run via the launcher,
   NOT `smallbaselineApp.py` directly (see gotchas):

   ```bash
   conda activate insar                         # env: ~/miniforge3/envs/insar (MintPy 1.6.2)
   cd insar/mintpy
   python ../run_mintpy.py ../hk_insar.cfg --end velocity
   # export GeoTIFFs (save_gdal drops the CRS, so re-stamp it):
   save_gdal.py velocity.h5           -d velocity        -o velocity.tif
   save_gdal.py temporalCoherence.h5                     -o temporalCoherence.tif
   save_gdal.py inputs/geometryGeo.h5 -d incidenceAngle  -o incidenceAngle.tif
   for t in velocity temporalCoherence incidenceAngle; do gdal_edit.py -a_srs EPSG:32649 $t.tif; done
   ```
5. **Join**: from the repo root, with the env active:
   ```bash
   python insar/sample_velocity.py --velocity insar/mintpy/velocity.tif \
       --coherence insar/mintpy/temporalCoherence.tif \
       --incidence insar/mintpy/incidenceAngle.tif --incidence-convention incidence-deg
   ```
   Writes `model/insar_features.csv` (OBJECTID, insar_velocity_mm_yr (LOS, primary),
   insar_coherence, insar_reliable, insar_incidence_deg, insar_vertical_mm_yr).
   Negative velocity ~ sinking. `model/train_baseline.py` merges OBJECTID + insar_velocity_mm_yr.

## Notes

- Only step 2+ need NASA Earthdata auth; they run on your account, so run them in your session.
- 80 m pixels (looks 20x4): the feature is "local subsidence velocity at the building," not per-footprint tilt.
- HK urban = strong coherence; vegetated hills decorrelate (irrelevant, we only score buildings).

## Single-track caveat

Single Sentinel-1 **ascending** track (021606/IW3, all 117 pairs ASCENDING). One look
direction means no true 3D: `insar_vertical_mm_yr = LOS / cos(incidence)` ASSUMES purely
vertical motion (false near reclamation lateral spread / slope creep). The ranker uses
**LOS**; vertical is a QA/secondary column only. Incidence ~44 deg (LOS to vertical x1.40).
Adding a descending track (e.g. 021607) would close coverage and enable real vertical.

## Gotchas (learned the hard way)

- **Do not name the config `smallbaselineApp.cfg`**. It collides with MintPy's default
  template name; MintPy silently reads the all-`auto` default and loads ZERO interferograms
  (`processor : isce`). Use a distinct name (`hk_insar.cfg`).
- **`insar/run_mintpy.py`** monkeypatches a NumPy-2.x incompatibility in MintPy 1.6.2's
  per-pixel inversion (`ifgram_inversion` + `dem_error` assign size-1 arrays into scalar
  slots; NumPy 2.x rejects this). Plain `smallbaselineApp.py` crashes at `invert_network`
  and `correct_topography`. Always launch through `run_mintpy.py`.
- **`save_gdal.py` drops the CRS** (MintPy stores a bogus `EPSG=9122`); re-stamp with
  `gdal_edit.py -a_srs EPSG:32649` (WGS84/UTM 49N) or pyproj sampling fails.
- Run everything with the env **activated** (`conda activate insar`), not the bare
  `bin/python`: PROJ/GDAL need `PROJ_DATA`/`GDAL_DATA` from activation.
- **`mintpy.subset.lalo = no` silently drops most of the network.** HyP3 burst products have
  slightly different geocoded extents per date; with no subset MintPy keeps one reference grid
  and loads only the matching pairs (34 of 117 here). Always subset to the common-overlap box
  so all 117 crop to a shared grid and the full network loads.

## Coverage + result

- Subset = common-overlap box of all 117 products (`22.1354:22.46,113.744:114.625`), which is
  85% of buildings geographically. But velocity exists only on coherent pixels: just **2.9% of
  the grid** is valid, so building coverage is **25.5% in-footprint / 23.7% reliable** (tempCoh>=0.7).
- **The ceiling is coherence, not footprint.** Going from the harbour-core box to the full-overlap
  box added only ~570 reliable buildings (11,519 -> 12,091): HK's measurable area is the dense urban
  core; New Territories hills and water decorrelate. A second track or L-band would help more than
  a bigger box.
- Velocity sign verified: built-up/reclaimed area reads negative vs the bedrock reference (subsidence).
- **Signal vs the DS2 inspection-notice label is ~zero** (corr ~0.00 in both the core and full runs;
  the <-10 mm/yr cohort is 5.7% positive vs 9.7% base, i.e. NOT elevated). PR-AUC is unchanged at
  0.140 with vs without InSAR. That label is "inspection/repair notice within 60 m", driven by
  facade/age dilapidation rather than ground motion, so weak association is the expected outcome.
