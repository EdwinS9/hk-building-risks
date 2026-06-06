"""
Discover the best Sentinel-1 burst over Hong Kong for an InSAR SBAS stack.

No authentication needed: queries ASF's public Search API and ranks bursts by
(a) how many DS1 buildings fall inside the burst footprint and (b) temporal depth.
Run: python3 insar/find_bursts.py
"""
import json, urllib.parse, urllib.request, collections
import pandas as pd

API = "https://api.daac.asf.alaska.edu/services/search/param"
DS1 = "data-analysis/DS1_all.csv"
START, END = "2020-01-01T00:00:00Z", "2021-12-31T23:59:59Z"

# 1. Building locations -> bounding box
df = pd.read_csv(DS1, usecols=["LATITUDE", "LONGITUDE"]).dropna()
minlon, maxlon = df.LONGITUDE.min(), df.LONGITUDE.max()
minlat, maxlat = df.LATITUDE.min(), df.LATITUDE.max()
print(f"DS1 buildings: {len(df)}  bbox: {minlon:.3f},{minlat:.3f} -> {maxlon:.3f},{maxlat:.3f}")

# 2. Query ASF for IW VV bursts intersecting the building extent
poly = (f"POLYGON(({minlon} {minlat},{maxlon} {minlat},{maxlon} {maxlat},"
        f"{minlon} {maxlat},{minlon} {minlat}))")
params = {
    "intersectsWith": poly, "platform": "SENTINEL-1", "processingLevel": "BURST",
    "beamMode": "IW", "polarization": "VV", "start": START, "end": END,
    "output": "jsonlite",
}
url = API + "?" + urllib.parse.urlencode(params)
res = json.load(urllib.request.urlopen(url, timeout=120))
res = res.get("results", res)
print(f"burst granules returned: {len(res)}")


def wkt_ring(w):
    s = w[w.find("((") + 2:w.find("))")]
    return [tuple(map(float, p.split())) for p in s.split(",")]


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring); j = n - 1
    for i in range(n):
        xi, yi = ring[i]; xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


groups = collections.defaultdict(lambda: {"dates": set()})
for r in res:
    b = r["burst"]; g = groups[b["fullBurstID"]]
    g["dates"].add(r["startTime"][:10])
    g.update(path=r["path"], fd=r["flightDirection"], ss=b["subswath"], wkt=r["wkt"])

# 3. Coverage: fraction of a building sample inside each burst footprint
sub = df.sample(min(5000, len(df)), random_state=1)
pts = list(zip(sub.LONGITUDE, sub.LATITUDE))
rows = []
for fid, g in groups.items():
    ring = wkt_ring(g["wkt"])
    cov = sum(point_in_ring(x, y, ring) for x, y in pts) / len(pts)
    rows.append((fid, g["fd"], g["path"], g["ss"], len(g["dates"]),
                 min(g["dates"]), max(g["dates"]), round(cov * 100, 1)))

rows.sort(key=lambda r: (-r[7], -r[4]))
print(f"\n{'burstID':20} {'dir':11} {'path':5} {'ss':4} {'ndates':6} "
      f"{'first':11} {'last':11} cov%")
for r in rows[:12]:
    print(f"{r[0]:20} {r[1]:11} {str(r[2]):5} {r[3]:4} {str(r[4]):6} "
          f"{r[5]:11} {r[6]:11} {r[7]}")

best = rows[0]
print(f"\nRecommended burst: {best[0]}  ({best[1]}, path {best[2]}, {best[3]})  "
      f"{best[4]} dates, {best[7]}% of buildings covered")
