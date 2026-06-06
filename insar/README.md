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
4. **Time series**: run the [MintPy Recipe Book](https://github.com/ASFOpenSARlab/opensarlab_MintPy_Recipe_Book)
   on `insar/products/` -> `smallbaselineApp.py` -> export geocoded `velocity.tif` (and `temporalCoherence.tif`).
   Set the reference point on stable bedrock, NOT reclamation (West Kowloon / Tung Chung / TKO).
5. **Join**: `python3 insar/sample_velocity.py --velocity velocity.tif --coherence temporalCoherence.tif`
   -> `insar/insar_features.csv` (OBJECTID, insar_velocity_mm_yr, insar_coherence). Negative velocity ~ sinking.

## Notes

- Only step 2+ need NASA Earthdata auth; they run on your account, so run them in your session.
- 80 m pixels (looks 20x4): the feature is "local subsidence velocity at the building," not per-footprint tilt.
- HK urban = strong coherence; vegetated hills decorrelate (irrelevant, we only score buildings).
