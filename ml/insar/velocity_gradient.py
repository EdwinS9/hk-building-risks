"""
Turn the MintPy LOS velocity raster into a velocity-GRADIENT factor for the web-app.

Why gradient, not raw velocity: differential settlement (how fast velocity changes across
space) is the structurally-meaningful quantity, not a single-point rate. A whole block
sinking uniformly is far less damaging than one edge sinking relative to the other. This is
a coarse 80 m proxy for that, surfaced as an EXTRA INFO layer in the block detail breakdown.
It does NOT change risk_score and is not a proven risk signal (see insar/README.md).

Run (env active): python insar/velocity_gradient.py
Inputs : insar/mintpy/velocity.tif (m/yr, EPSG:32649)
Outputs:
  insar/mintpy/velocity_gradient.tif    gradient magnitude raster, mm/yr per 100 m
  model/insar_features.csv              + insar_velocity_gradient (mm/yr/100m), insar_gradient_score
                                          (0-100, capped-linear @ p95, NULL where no signal),
                                          insar_has_data (1/0) for weighted-sum renormalization
  model/insar_scores.csv                object_id, score_name, score_value  (scores-table ready)
  model/insar_scores.sql                drop-in upsert into public.scores (joined on object_id)
"""
import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer

VEL = "insar/mintpy/velocity.tif"
GRAD_TIF = "insar/mintpy/velocity_gradient.tif"
DS1 = "data-analysis/DS1_all.csv"
FEATURES = "model/insar_features.csv"
SCORES_CSV = "model/insar_scores.csv"
SCORES_SQL = "model/insar_scores.sql"
PIXEL_M = 80.0
SCORE_NAME = "Ground subsidence (InSAR)"


def main():
    with rasterio.open(VEL) as ds:
        v = ds.read(1).astype(float) * 1000.0       # m/yr -> mm/yr
        crs, profile = ds.crs, ds.profile

    v[~np.isfinite(v)] = np.nan
    v[v == 0] = np.nan                              # MintPy nodata at masked pixels

    # spatial gradient magnitude; NaN neighbours propagate, so the gradient exists only
    # inside contiguous coherent patches (exactly where it is trustworthy).
    gy, gx = np.gradient(v, PIXEL_M)               # mm/yr per metre
    grad = np.hypot(gx, gy) * 100.0               # mm/yr per 100 m

    profile.update(dtype="float32", count=1, nodata=np.nan)
    with rasterio.open(GRAD_TIF, "w", **profile) as dst:
        dst.write(grad.astype("float32"), 1)

    # sample gradient at every building
    b = pd.read_csv(DS1, usecols=["OBJECTID", "LATITUDE", "LONGITUDE"]).dropna()
    tf = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    xs, ys = tf.transform(b.LONGITUDE.tolist(), b.LATITUDE.tolist())
    with rasterio.open(GRAD_TIF) as ds:
        grad_b = np.array([s[0] for s in ds.sample(zip(xs, ys))], dtype=float)
    grad_b[~np.isfinite(grad_b)] = np.nan

    # capped-linear score in [0,1]: p95 cap so a stable building reads ~0 and only
    # genuinely high-differential ones approach 1. NaN (no signal) is kept NaN, NOT
    # filled, so the later weighted sum can renormalize over the factors each building
    # actually has (insar_has_data flags presence). Web-app uses x1, the model uses x100.
    valid = np.isfinite(grad_b)
    cap = float(np.nanpercentile(grad_b[valid], 95)) if valid.any() else 1.0
    score01 = np.where(valid, np.clip(grad_b / cap, 0.0, 1.0), np.nan)

    # merge feature columns into the table (idempotent)
    feat = pd.read_csv(FEATURES)
    gdf = pd.DataFrame({
        "OBJECTID": b.OBJECTID.values,
        "insar_velocity_gradient": grad_b,
        "insar_gradient_score": np.round(score01 * 100.0, 2),   # 0-100, NULL where no signal
        "insar_has_data": valid.astype(int),
    })
    feat = feat.drop(columns=["insar_velocity_gradient", "insar_gradient_score", "insar_has_data"],
                     errors="ignore").merge(gdf, on="OBJECTID", how="left")
    feat["insar_has_data"] = feat["insar_has_data"].fillna(0).astype(int)
    feat.to_csv(FEATURES, index=False)

    out = pd.DataFrame({
        "object_id": b.OBJECTID.values[valid].astype(str),
        "score_name": SCORE_NAME,
        "score_value": np.round(score01[valid], 4),
    })
    out.to_csv(SCORES_CSV, index=False)

    # drop-in SQL: upsert one scores row per matching block (no-op for blocks not yet loaded)
    rows = ",\n".join(
        f"    ('{oid}', {sv:.4f})" for oid, sv in zip(out.object_id, out.score_value)
    )
    sql = f"""-- InSAR ground-subsidence gradient as a display-only factor in public.scores.
-- Normalized mm/yr-per-100m, p95 cap = {cap:.3f}. Joins by blocks.object_id; rows for
-- blocks not yet ingested are silently skipped. Does NOT change blocks.risk_score.
insert into public.scores (block_id, score_name, score_value)
select b.id, '{SCORE_NAME}', v.score_value
from (values
{rows}
) as v(object_id, score_value)
join public.blocks b on b.object_id = v.object_id
on conflict (block_id, score_name) do update set score_value = excluded.score_value;
"""
    with open(SCORES_SQL, "w") as f:
        f.write(sql)

    print(f"gradient raster : {GRAD_TIF}  (valid {int(valid.sum())} px-samples, "
          f"median {np.nanmedian(grad_b):.2f}, p95 cap {cap:.2f} mm/yr/100m)")
    print(f"feature columns : {FEATURES}  (+insar_velocity_gradient, insar_gradient_score (0-100), "
          f"insar_has_data; signal on {int(valid.sum())}/{len(feat)} buildings)")
    print(f"scores artifact : {SCORES_CSV} + {SCORES_SQL}  ({len(out)} rows, score_name='{SCORE_NAME}')")


if __name__ == "__main__":
    main()
