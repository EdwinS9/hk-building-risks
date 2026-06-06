"""
Submit a Sentinel-1 burst InSAR SBAS stack to ASF HyP3 for Hong Kong.

This is the ONE step that needs YOUR NASA Earthdata login (it runs jobs on your
account). Everything is seeded from insar/find_bursts.py.

Setup (once):
    pip install hyp3_sdk
Run:
    python3 insar/submit_hyp3.py
    # prompts for your Earthdata username/password (or reads ~/.netrc)

It builds a small-baseline network over the chosen burst and submits one HyP3
burst-InSAR job per interferogram pair, all tagged with PROJECT_NAME so you can
pull them back as a batch later (see insar/download_hyp3.py).
"""
import json, urllib.parse, urllib.request, sys

# ---- config (tune these) -------------------------------------------------
BURST_ID = "011_021606_IW3"          # from find_bursts.py (73% building coverage)
HK_POINT = "POINT(114.17 22.32)"     # any point inside the burst, for the ASF query
START, END = "2020-01-01T00:00:00Z", "2021-12-31T23:59:59Z"
PROJECT_NAME = "hk_insar_011_021606_IW3"
MAX_DATES = 30        # thin from 61 -> ~24-day sampling to keep job count tractable
CONNECTIONS = 2       # link each date to the next N (small-baseline network)
LOOKS = "20x4"        # 80 m pixels, standard for SBAS velocity
APPLY_WATER_MASK = True
# -------------------------------------------------------------------------

API = "https://api.daac.asf.alaska.edu/services/search/param"


def burst_granules():
    """One burst granule per acquisition date for BURST_ID, sorted by date."""
    params = {
        "intersectsWith": HK_POINT, "platform": "SENTINEL-1",
        "processingLevel": "BURST", "beamMode": "IW", "polarization": "VV",
        "start": START, "end": END, "output": "jsonlite",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    res = json.load(urllib.request.urlopen(url, timeout=120))
    res = res.get("results", res)
    by_date = {}
    for r in res:
        if r["burst"]["fullBurstID"] == BURST_ID:
            by_date[r["startTime"][:10]] = r["granuleName"]
    return [by_date[d] for d in sorted(by_date)]


def thin(items, keep):
    if keep >= len(items):
        return items
    step = len(items) / keep
    return [items[int(i * step)] for i in range(keep)]


def make_pairs(granules, conn):
    pairs = []
    for i in range(len(granules)):
        for j in range(i + 1, min(i + 1 + conn, len(granules))):
            pairs.append((granules[i], granules[j]))   # reference, secondary
    return pairs


def main():
    granules = thin(burst_granules(), MAX_DATES)
    pairs = make_pairs(granules, CONNECTIONS)
    print(f"burst {BURST_ID}: {len(granules)} dates -> {len(pairs)} interferogram pairs")
    if not pairs:
        sys.exit("No burst granules found. Check BURST_ID / date range.")

    try:
        import hyp3_sdk
    except ImportError:
        sys.exit("Run: pip install hyp3_sdk")

    hyp3 = hyp3_sdk.HyP3()   # prompts for Earthdata login, or uses ~/.netrc
    batch = hyp3_sdk.Batch()
    for ref, sec in pairs:
        batch += hyp3.submit_insar_isce_burst_job(
            ref, sec, name=PROJECT_NAME,
            apply_water_mask=APPLY_WATER_MASK, looks=LOOKS,
        )
    print(f"submitted {len(batch)} jobs under project '{PROJECT_NAME}'")
    print("Track them at https://search.asf.alaska.edu (On Demand tab) or run "
          "insar/download_hyp3.py once they finish.")


if __name__ == "__main__":
    main()
