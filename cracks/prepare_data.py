"""
Build the manifest the two specialist models train on.

Each row has: path, domain, label, split
  domain in {facade, asphalt, other}
  label  in {none, crack, other}        (per-specialist class)

A facade specialist trains on rows with domain in {facade, other}; an asphalt
specialist on rows with domain in {asphalt, other}. The `other` rows (not a
surface) are shared by both as the out-of-distribution class.

Sources:
  - Ozgenel concrete patches (227x227): Positive -> (facade, crack),
    Negative -> (facade, none).
  - CRACK500 asphalt (large image + binary mask): tiled into overlapping 224 px
    patches; a tile with mask coverage >= CRACK_FRAC -> (asphalt, crack), a tile
    with zero crack pixels -> (asphalt, none). Split is assigned per SOURCE IMAGE
    (no leakage of overlapping tiles across train/test).
  - Imagenette photos -> (other, other).

Each (domain, label) group is capped at --max-per-class; the class-weighted loss
in train.py handles residual imbalance.

Run: python3 cracks/prepare_data.py [--max-per-class N] [--tile 224] [--stride 112]
Output: cracks/data/manifest.csv
"""
import argparse
import random
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

HERE = Path(__file__).resolve().parent
RAW = HERE / "data" / "raw"
PATCH_DIR = HERE / "data" / "patches"
MANIFEST = HERE / "data" / "manifest.csv"

SEED = 1
CRACK_FRAC = 0.03   # >= 3% crack pixels in a tile -> crack
CLEAN_FRAC = 0.0    # exactly 0 crack pixels -> none


def collect_ozgenel():
    base = RAW / "ozgenel"
    pos = sorted(str(p) for p in base.rglob("Positive/*")
                 if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    neg = sorted(str(p) for p in base.rglob("Negative/*")
                 if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    return pos, neg


def collect_other():
    """Imagenette photos (dogs, fish, vehicles, instruments, buildings, ...) as
    the 'other' / not-a-surface class shared by both specialists."""
    base = RAW / "imagenette"
    return sorted(str(p) for p in base.rglob("*")
                  if p.suffix.lower() in (".jpg", ".jpeg", ".png"))


def _crack500_pairs() -> list[tuple[Path, Path, str]]:
    """(photo, mask, group) triples, handling CRACK500's two folder layouts:
      test/  : images/<n>.jpg              (photo) <-> cracks/<n>.png     (mask)
      train/ : conditions/<n>_condition.jpg (photo) <-> images/<n>.png    (mask)
    The train split puts MASKS in 'images', so we pair explicitly. `group` keys
    the leakage-safe split."""
    base = RAW / "crack500" / "crack500_and_deepcrack" / "CRACK500"
    pairs = []
    for ph in sorted((base / "test" / "images").glob("*")):
        if ph.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        m = base / "test" / "cracks" / f"{ph.stem}.png"
        if m.exists():
            pairs.append((ph, m, f"test_{ph.stem}"))
    for ph in sorted((base / "train" / "conditions").glob("*")):
        if ph.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        stem = ph.stem.replace("_condition", "")
        m = base / "train" / "images" / f"{stem}.png"
        if m.exists():
            pairs.append((ph, m, f"train_{stem}"))
    return pairs


def _looks_like_mask(arr_rgb: np.ndarray) -> bool:
    g = arr_rgb.mean(axis=2)
    return float(((g < 20) | (g > 235)).mean()) > 0.5


def _split_for_group(name: str, rng_seed: int = SEED) -> str:
    import hashlib
    h = int(hashlib.md5(f"{rng_seed}:{name}".encode()).hexdigest(), 16) % 100
    return "test" if h < 15 else "val" if h < 30 else "train"


def tile_crack500(tile: int, stride: int):
    """Tile CRACK500 image/mask pairs into rows of {path,domain,label,split};
    split assigned per source image to prevent leakage."""
    out_crack = PATCH_DIR / "asphalt_crack"
    out_clean = PATCH_DIR / "asphalt_none"
    out_crack.mkdir(parents=True, exist_ok=True)
    out_clean.mkdir(parents=True, exist_ok=True)

    rows, skipped = [], 0
    for img_path, mpath, group in _crack500_pairs():
        im = Image.open(img_path).convert("RGB")
        if _looks_like_mask(np.asarray(im)):
            skipped += 1
            continue
        split = _split_for_group(group)
        mk = Image.open(mpath).convert("L").resize(im.size, Image.NEAREST)
        arr = np.asarray(mk) > 127
        W, H = im.size
        idx = 0
        for top in range(0, max(H - tile, 0) + 1, stride):
            for left in range(0, max(W - tile, 0) + 1, stride):
                box = (left, top, left + tile, top + tile)
                frac = arr[top:top + tile, left:left + tile].mean()
                stem = f"{group}_{idx}"
                if frac >= CRACK_FRAC:
                    fp = out_crack / f"{stem}.jpg"
                    im.crop(box).save(fp, quality=90)
                    rows.append({"path": str(fp), "domain": "asphalt",
                                 "label": "crack", "split": split})
                elif frac <= CLEAN_FRAC:
                    fp = out_clean / f"{stem}.jpg"
                    im.crop(box).save(fp, quality=90)
                    rows.append({"path": str(fp), "domain": "asphalt",
                                 "label": "none", "split": split})
                idx += 1
    if skipped:
        print(f"  (skipped {skipped} mask-like 'photos')")
    return rows


def random_split_rows(groups: list[tuple[str, str, list[str]]], rng):
    """Per-image random 70/15/15 split. groups = [(domain, label, paths), ...]."""
    rows = []
    for domain, label, paths in groups:
        paths = list(paths)
        rng.shuffle(paths)
        n = len(paths)
        n_test, n_val = int(n * 0.15), int(n * 0.15)
        for i, p in enumerate(paths):
            split = ("test" if i < n_test
                     else "val" if i < n_test + n_val else "train")
            rows.append({"path": p, "domain": domain, "label": label,
                         "split": split})
    return rows


def cap_per_group(df: pd.DataFrame, cap: int) -> pd.DataFrame:
    """Cap each (domain, label) group to `cap` rows (seeded sample)."""
    keep = [g.sample(frac=1.0, random_state=SEED).head(cap)
            for _, g in df.groupby(["domain", "label"])]
    return pd.concat(keep).sample(frac=1.0, random_state=SEED).reset_index(drop=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-per-class", type=int, default=6000)
    ap.add_argument("--tile", type=int, default=224)
    ap.add_argument("--stride", type=int, default=112)
    args = ap.parse_args()
    rng = random.Random(SEED)

    print("collecting Ozgenel concrete (facade) patches...")
    facade_crack, facade_none = collect_ozgenel()
    print(f"  facade crack: {len(facade_crack)}  facade none: {len(facade_none)}")

    print("collecting Imagenette 'other' (not-a-surface) photos...")
    other = collect_other()
    print(f"  other: {len(other)}")

    print("tiling CRACK500 asphalt image/mask pairs (split by source image)...")
    asphalt_rows = tile_crack500(args.tile, args.stride)
    print(f"  asphalt crack: {sum(r['label']=='crack' for r in asphalt_rows)}  "
          f"asphalt none: {sum(r['label']=='none' for r in asphalt_rows)}")

    rows = random_split_rows([
        ("facade", "crack", facade_crack),
        ("facade", "none", facade_none),
        ("other", "other", other),
    ], rng) + asphalt_rows

    df = cap_per_group(pd.DataFrame(rows), args.max_per_class)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(MANIFEST, index=False)

    print(f"\ncapped each (domain,label) at {args.max_per_class}")
    print("\nmanifest counts (domain/label x split):")
    print(pd.crosstab([df.domain, df.label], df.split).to_string())
    print(f"\nwrote {MANIFEST}  ({len(df)} rows)")
    print("next: ./.venv/bin/python cracks/train.py --domain facade  (then --domain asphalt)")


if __name__ == "__main__":
    main()
