"""
Build the baseline feature table and label by joining DS2 inspection/repair
notices onto DS1 buildings (nearest-neighbour by coordinate).

Run: python3 model/build_features.py
Outputs: model/building_features.csv  and prints the key gate numbers.
"""
import math
import numpy as np
import pandas as pd

DS1 = "data-analysis/DS1_all.csv"
DS2 = "data-analysis/DS2_inspection.csv"
OUT = "model/building_features.csv"
MATCH_M = 60.0          # a notice within this distance flags its nearest building
THIS_YEAR = 2026

# ---- buildings ----------------------------------------------------------
b = pd.read_csv(DS1)
b = b.rename(columns={
    "SEARCH1_E": "district", "NSEARCH3_E": "op_date",
    "NSEARCH4_E": "structure", "NSEARCH5_E": "use_class",
})
b["op_year"] = pd.to_datetime(b["op_date"], errors="coerce").dt.year
b["age"] = THIS_YEAR - b["op_year"]
b = b.dropna(subset=["LATITUDE", "LONGITUDE"]).reset_index(drop=True)

# ---- notices ------------------------------------------------------------
n = pd.read_csv(DS2).dropna(subset=["LATITUDE", "LONGITUDE"])

# ---- nearest-building join (local equirectangular metres) ---------------
lat0 = math.radians(b.LATITUDE.mean())
mx, my = 111320 * math.cos(lat0), 110540          # metres per degree lon/lat
bx, by = b.LONGITUDE.values * mx, b.LATITUDE.values * my
nx, ny = n.LONGITUDE.values * mx, n.LATITUDE.values * my

hit = np.zeros(len(b), dtype=bool)
dists = []
for i in range(len(n)):
    d = np.hypot(bx - nx[i], by - ny[i])
    j = int(d.argmin())
    dists.append(d[j])
    if d[j] <= MATCH_M:
        hit[j] = True
b["label"] = hit.astype(int)
dists = np.array(dists)

# ---- report -------------------------------------------------------------
print(f"buildings:            {len(b)}")
print(f"notices:              {len(n)}")
within = (dists <= MATCH_M).sum()
print(f"notices matched <= {MATCH_M:.0f} m: {within} ({within/len(n)*100:.0f}%)")
print(f"notice->building dist p50/p90/p95 m: "
      f"{np.percentile(dists,50):.0f} / {np.percentile(dists,90):.0f} / {np.percentile(dists,95):.0f}")
print(f"POSITIVE buildings:   {b.label.sum()}  ({b.label.mean()*100:.2f}% of stock)")
print(f"age coverage:         {b.age.notna().sum()}/{len(b)} have an occupation year")
print("\npositive rate by age band:")
band = pd.cut(b.age, [0, 20, 30, 40, 50, 200],
             labels=["<20", "20-30", "30-40", "40-50", "50+"])
print((b.groupby(band, observed=True).label.agg(["mean", "size"]) * [100, 1])
      .rename(columns={"mean": "pos_rate_%", "size": "n"}).round(2).to_string())

keep = ["OBJECTID", "district", "structure", "use_class", "age",
        "LATITUDE", "LONGITUDE", "label"]
b[keep].to_csv(OUT, index=False)
print(f"\nwrote {OUT}")
