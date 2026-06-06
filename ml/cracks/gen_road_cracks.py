"""
Generate MOCK road-crack detections at the spots where they are most physically
likely, for the web UI demo.

"Most likely" = highest InSAR subsidence GRADIENT (differential ground
settlement is the direct driver of pavement cracking). We take the top distinct
locations from model/insar_features.csv (joined to model/scored.csv for
coordinates/district/risk), nudge each a few metres onto the adjacent road, and
attach plausible crack attributes. The crack-heatmap thumbnail shown in the UI
is a REAL output of the trained asphalt specialist (cracks/model_asphalt.pt) run
over a CRACK500 road photo, not a fake graphic.

Outputs:
  public/cracks/crack_<i>.png   real model heatmap overlays (served at /cracks/..)
  src/data/roadCracks.ts        typed static array consumed by the map

Run: ./.venv/bin/python cracks/gen_road_cracks.py
"""
import json
import math
from pathlib import Path

import pandas as pd
import torch
from PIL import Image

from dataset import build_transforms
from infer import classify_pil, heatmap_pil, load_model, ckpt_path

HERE = Path(__file__).resolve().parent                 # ml/cracks
ML = HERE.parent                                        # ml
REPO = ML.parent                                        # repo root
WEBAPP = REPO / "apps" / "web-app"                      # frontend app
INSAR = ML / "model" / "insar_features.csv"
SCORED = ML / "model" / "scored.csv"
ROAD_PHOTOS = sorted((HERE / "data" / "raw" / "crack500" /
                      "crack500_and_deepcrack" / "CRACK500" / "test" /
                      "images").glob("*.jpg"))
PUBLIC = WEBAPP / "public" / "cracks"
TS_OUT = WEBAPP / "src" / "data" / "roadCracks.ts"

N_CRACKS = 8
SEED = 7
TYPES = ["Alligator", "Longitudinal", "Transverse", "Block", "Pothole edge"]
DATES = ["2026-05-18", "2026-05-21", "2026-05-24", "2026-05-27",
         "2026-05-30", "2026-06-02", "2026-06-03", "2026-06-04"]


def severity(grad: float, vmag: float) -> str:
    # Placement is by gradient (which saturates at 100 for the top spots), so
    # severity is driven by the settlement RATE (|velocity|) to give a realistic
    # spread rather than labelling every hotspot 'Severe'.
    if vmag >= 25:
        return "Severe"
    if vmag >= 8:
        return "High"
    if vmag >= 3:
        return "Moderate"
    return "Low"


def pick_spots() -> pd.DataFrame:
    df = pd.read_csv(INSAR).merge(pd.read_csv(SCORED), on="OBJECTID", how="inner")
    df = df[(df.insar_has_data == 1) & (df.insar_reliable)]
    df = df.sort_values("insar_gradient_score", ascending=False)
    # dedupe to distinct ~100 m locations so cracks are spread out, not stacked
    df["latr"] = df.LATITUDE.round(3)
    df["lonr"] = df.LONGITUDE.round(3)
    df = df.drop_duplicates(["latr", "lonr"])
    # take a spread across districts: round-robin by district over the top slice
    top = df.head(60)
    spots, seen_dist = [], {}
    for _, r in top.iterrows():
        k = r.district
        seen_dist[k] = seen_dist.get(k, 0) + 1
        spots.append(r)
    # prefer variety: sort so districts interleave, then take N
    spots = sorted(top.to_dict("records"),
                   key=lambda r: (-r["insar_gradient_score"], r["district"]))
    out, per = [], {}
    for r in spots:
        if per.get(r["district"], 0) >= 3:   # cap 3 per district for spread
            continue
        per[r["district"]] = per.get(r["district"], 0) + 1
        out.append(r)
        if len(out) >= N_CRACKS:
            break
    return out


def nudge(lat, lng, i):
    # deterministic ~30 m offset onto the adjacent road
    ang = (i * 137.5) * math.pi / 180.0
    d = 0.00028
    return lat + d * math.sin(ang), lng + d * math.cos(ang)


def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, _, _ = load_model(ckpt_path("asphalt"), device)
    tf = build_transforms(train=False)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    spots = pick_spots()
    records = []
    for i, r in enumerate(spots):
        photo = ROAD_PHOTOS[i % len(ROAD_PHOTOS)]
        im = Image.open(photo)
        overlay, stats = heatmap_pil(model, tf, device, im, "asphalt",
                                     tile=224, stride=112, min_conf=0.5)
        # downscale overlay for the web and save as JPEG (PNG photos are ~10x
        # heavier for no visible gain on a thumbnail)
        overlay.thumbnail((720, 720))
        overlay.convert("RGB").save(PUBLIC / f"crack_{i+1}.jpg", quality=85)
        conf = classify_pil(model, tf, device, im).get("crack", 0.9)

        grad = float(r["insar_gradient_score"])
        vel = float(r["insar_velocity_mm_yr"])
        vmag = abs(vel)
        lat, lng = nudge(float(r["LATITUDE"]), float(r["LONGITUDE"]), i)
        sev = severity(grad, vmag)
        width = round(min(40.0, 3.0 + vmag * 0.9), 1)
        length = round(6 + (i % 5) * 7 + vmag * 0.4, 1)
        records.append({
            "id": f"crack-{i+1}",
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "district": r["district"],
            "severity": sev,
            "crackType": TYPES[i % len(TYPES)],
            "lengthM": length,
            "widthMm": width,
            "confidence": round(float(conf), 3),
            "detectedAt": DATES[i % len(DATES)],
            "heatmap": f"/cracks/crack_{i+1}.jpg",
            "subsidenceGradientScore": round(grad, 1),
            "subsidenceVelocityMmYr": round(vel, 1),
            "nearestBlockRisk": round(float(r["risk_score"]), 1),
            "crackTilePct": stats["pct_cracked"],
        })
        print(f"  crack-{i+1}: {sev:8s} {r['district']:14s} "
              f"grad={grad:.0f} vel={vel:+.1f}mm/yr conf={conf:.2f} <- {photo.name}")

    TS_OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(records, indent=2)
    ts = (
        "// AUTO-GENERATED by cracks/gen_road_cracks.py - do not edit by hand.\n"
        "// Mock road-crack detections placed at the highest InSAR subsidence-\n"
        "// gradient locations (differential settlement = pavement-crack driver).\n"
        "// Heatmap thumbnails are real outputs of the asphalt crack model.\n\n"
        "export interface RoadCrack {\n"
        "  id: string;\n  lat: number;\n  lng: number;\n  district: string;\n"
        "  severity: 'Low' | 'Moderate' | 'High' | 'Severe';\n"
        "  crackType: string;\n  lengthM: number;\n  widthMm: number;\n"
        "  confidence: number;\n  detectedAt: string;\n  heatmap: string;\n"
        "  subsidenceGradientScore: number;\n  subsidenceVelocityMmYr: number;\n"
        "  nearestBlockRisk: number;\n  crackTilePct: number;\n}\n\n"
        f"export const ROAD_CRACKS: RoadCrack[] = {body};\n"
    )
    TS_OUT.write_text(ts)
    print(f"\nwrote {TS_OUT} ({len(records)} cracks)")
    print(f"wrote heatmaps -> {PUBLIC}")


if __name__ == "__main__":
    main()
