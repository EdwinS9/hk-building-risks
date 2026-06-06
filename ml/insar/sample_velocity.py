"""
Sample a MintPy LOS velocity raster at each DS1 building -> the InSAR feature.

Run after MintPy exports a geocoded velocity GeoTIFF (and optionally a
temporal-coherence GeoTIFF for a confidence flag).

    pip install rasterio pyproj pandas      # already present in a MintPy env
    python3 insar/sample_velocity.py --velocity path/to/velocity.tif \
        [--coherence path/to/temporalCoherence.tif] \
        [--incidence path/to/incidenceAngle.tif [--incidence-convention incidence-deg|theta-rad]]

Output: model/insar_features.csv
        Always: OBJECTID, insar_velocity_mm_yr (LOS) [, insar_coherence, insar_reliable]
        With --incidence: + insar_incidence_deg, insar_vertical_mm_yr (= LOS / cos(incidence))
Merge it onto the building table by OBJECTID (train_baseline.py reads OBJECTID +
insar_velocity_mm_yr). Negative velocity ~ subsidence. The ranker uses LOS; vertical
is a derived secondary column only (single ascending track -> vertical assumes purely
vertical motion, see insar/README.md).
"""
import argparse
import numpy as np
import pandas as pd

DS1 = "data-analysis/DS1_all.csv"
OUT = "model/insar_features.csv"
UNIT_SCALE = 1000.0   # MintPy velocity is m/yr; convert to mm/yr
COH_FLOOR = 0.7       # below this, the velocity is unreliable (flagged, not dropped)


def sample(raster_path, lons, lats):
    import rasterio
    from pyproj import Transformer
    with rasterio.open(raster_path) as ds:
        tf = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
        xs, ys = tf.transform(lons, lats)
        return [v[0] for v in ds.sample(zip(xs, ys))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--velocity", required=True, help="MintPy velocity GeoTIFF (m/yr)")
    ap.add_argument("--coherence", help="MintPy temporalCoherence GeoTIFF (optional)")
    ap.add_argument("--incidence", help="incidence/look-angle raster; enables insar_vertical_mm_yr")
    ap.add_argument("--incidence-convention", choices=["incidence-deg", "theta-rad"],
                    default="incidence-deg",
                    help="incidence-deg = MintPy incidenceAngle (degrees from vertical); "
                         "theta-rad = raw HyP3 *_lv_theta.tif (elevation angle in radians from horizontal)")
    args = ap.parse_args()

    df = pd.read_csv(DS1, usecols=["OBJECTID", "LATITUDE", "LONGITUDE"]).dropna()
    lons, lats = df.LONGITUDE.tolist(), df.LATITUDE.tolist()

    out = pd.DataFrame({"OBJECTID": df.OBJECTID})
    out["insar_velocity_mm_yr"] = [v * UNIT_SCALE for v in sample(args.velocity, lons, lats)]
    if args.coherence:
        out["insar_coherence"] = sample(args.coherence, lons, lats)
        out["insar_reliable"] = out["insar_coherence"] >= COH_FLOOR

    if args.incidence:
        # Single ascending track: vertical assumes purely vertical motion (see README).
        ang = np.array(sample(args.incidence, lons, lats), dtype=float)
        if args.incidence_convention == "theta-rad":
            # HyP3 lv_theta = look-vector ELEVATION angle (rad) from horizontal;
            # incidence = pi/2 - theta, so cos(incidence) = sin(theta).
            cos_inc = np.sin(ang)
            inc_deg = np.rad2deg(np.pi / 2 - ang)
        else:
            # MintPy incidenceAngle is measured from the vertical, in degrees.
            cos_inc = np.cos(np.deg2rad(ang))
            inc_deg = ang
        cos_inc[~np.isfinite(cos_inc)] = np.nan
        cos_inc[np.abs(cos_inc) < 0.1] = np.nan   # guard /0 from nodata/water/edge
        out["insar_incidence_deg"] = inc_deg
        out["insar_vertical_mm_yr"] = out["insar_velocity_mm_yr"] / cos_inc

    import os
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out.to_csv(OUT, index=False)
    n_cov = out["insar_velocity_mm_yr"].notna().sum()
    print(f"wrote {OUT}: {n_cov}/{len(out)} buildings got an InSAR velocity")
    if args.coherence:
        print(f"  reliable (coherence >= {COH_FLOOR}): {int(out['insar_reliable'].sum())}")
    if args.incidence:
        n_vert = out["insar_vertical_mm_yr"].notna().sum()
        print(f"  vertical ({args.incidence_convention}): {n_vert}/{len(out)} buildings")


if __name__ == "__main__":
    main()
