"""
Sample a MintPy LOS velocity raster at each DS1 building -> the InSAR feature.

Run after MintPy exports a geocoded velocity GeoTIFF (and optionally a
temporal-coherence GeoTIFF for a confidence flag).

    pip install rasterio pyproj pandas      # already present in a MintPy env
    python3 insar/sample_velocity.py --velocity path/to/velocity.tif \
        [--coherence path/to/temporalCoherence.tif]

Output: insar/insar_features.csv  (OBJECTID, insar_velocity_mm_yr[, insar_coherence])
Merge it onto the building table by OBJECTID. Negative velocity ~ subsidence.
"""
import argparse
import pandas as pd

DS1 = "Data Analysis/DS1_all.csv"
OUT = "insar/insar_features.csv"
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
    args = ap.parse_args()

    df = pd.read_csv(DS1, usecols=["OBJECTID", "LATITUDE", "LONGITUDE"]).dropna()
    lons, lats = df.LONGITUDE.tolist(), df.LATITUDE.tolist()

    out = pd.DataFrame({"OBJECTID": df.OBJECTID})
    out["insar_velocity_mm_yr"] = [v * UNIT_SCALE for v in sample(args.velocity, lons, lats)]
    if args.coherence:
        out["insar_coherence"] = sample(args.coherence, lons, lats)
        out["insar_reliable"] = out["insar_coherence"] >= COH_FLOOR

    out.to_csv(OUT, index=False)
    n_cov = out["insar_velocity_mm_yr"].notna().sum()
    print(f"wrote {OUT}: {n_cov}/{len(out)} buildings got an InSAR velocity")
    if args.coherence:
        print(f"  reliable (coherence >= {COH_FLOOR}): {int(out['insar_reliable'].sum())}")


if __name__ == "__main__":
    main()
