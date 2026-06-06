"""
Download the crack-image datasets (Hugging Face mirrors, no login required).

We assemble a 3-class problem from two open datasets:

  1. Ozgenel "Concrete Crack Images for Classification" (40k 227x227 patches)
     mirror: huggingface.co/datasets/mohammadnajeeb/concrete_crack_images
       Positive/  -> facade_crack  (vertical concrete surface = facade analogue)
       Negative/  -> none          (clean concrete)

  2. CRACK500 (asphalt pavement, image + binary mask pairs), bundled in
     mirror: huggingface.co/datasets/xcll/crack500_and_deepcrack
       CRACK500/*/images/  RGB photos of cracked asphalt
       CRACK500/*/cracks/  matching binary crack masks
     -> tiled into 224 px patches in prepare_data.py: crack tiles become
        asphalt_crack, clean tiles become none (asphalt).

Why not satellite imagery: mm-scale cracks are 90-900x below the best
commercial satellite GSD (~30 cm), and facades are invisible to near-nadir
satellites. Close-range / drone imagery (~1 mm/px) is the only viable modality.
See cracks/README.md for the full feasibility argument.

Why these mirrors: the canonical hosts (USU DigitalCommons for SDNET2018,
Mendeley .rar for Ozgenel) are respectively behind an Imperva bot-wall and a
RAR archive with no extractor in this environment. The HF mirrors are plain
ZIPs served over a scriptable CDN.

Run: python3 cracks/download_data.py
Output: cracks/data/raw/{ozgenel,crack500}/...
"""
import io
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path
from urllib.request import urlopen, Request

HERE = Path(__file__).resolve().parent
RAW = HERE / "data" / "raw"
UA = {"User-Agent": "Mozilla/5.0"}

# (url, extract_subdir, sentinel_relpath that proves it is already extracted)
OZGENEL_BASE = ("https://huggingface.co/datasets/mohammadnajeeb/"
                "concrete_crack_images/resolve/main/data")
OZGENEL_ZIPS = ["train.zip", "validation.zip", "test.zip"]
CRACK500_URL = ("https://huggingface.co/datasets/xcll/crack500_and_deepcrack/"
                "resolve/main/crack500_and_deepcrack.zip")
# Imagenette: 10 everyday categories (incl. dogs) used as the 'other' /
# not-a-surface class so non-surface photos are not forced into a crack class.
IMAGENETTE_URL = "https://s3.amazonaws.com/fast-ai-imageclas/imagenette2-160.tgz"


def fetch(url: str) -> bytes:
    print(f"  GET {url}")
    req = Request(url, headers=UA)
    with urlopen(req, timeout=300) as r:
        return r.read()


def extract_zip(data: bytes, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in zf.namelist():
            if name.endswith("/"):
                continue
            target = out / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as src, open(target, "wb") as dst:
                dst.write(src.read())
            n += 1
    return n


def get_ozgenel():
    out = RAW / "ozgenel"
    if (out / "train" / "Positive").is_dir():
        print("ozgenel: already present")
        return
    print("ozgenel: downloading concrete crack patches")
    for z in OZGENEL_ZIPS:
        data = fetch(f"{OZGENEL_BASE}/{z}")
        n = extract_zip(data, out)
        print(f"    {z}: extracted {n} files")


def get_crack500():
    out = RAW / "crack500"
    if (out / "crack500_and_deepcrack" / "CRACK500").is_dir():
        print("crack500: already present")
        return
    print("crack500: downloading asphalt image/mask pairs")
    data = fetch(CRACK500_URL)
    n = extract_zip(data, out)
    print(f"    extracted {n} files")


def get_imagenette():
    out = RAW / "imagenette"
    if (out / "imagenette2-160").is_dir():
        print("imagenette: already present")
        return
    out.mkdir(parents=True, exist_ok=True)
    tgz = RAW.parent / "imagenette2-160.tgz"
    print("imagenette: downloading 'other' / not-a-surface photos")
    if shutil.which("curl"):
        rc = subprocess.call(["curl", "-sL", "-A", "Mozilla/5.0",
                              "-o", str(tgz), IMAGENETTE_URL])
        if rc != 0:
            raise RuntimeError(f"curl imagenette failed (rc={rc})")
    else:
        tgz.write_bytes(fetch(IMAGENETTE_URL))
    with tarfile.open(tgz) as tf:
        tf.extractall(out)
    tgz.unlink(missing_ok=True)
    print(f"    extracted -> {out}")


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    get_ozgenel()
    get_crack500()
    get_imagenette()
    # sanity counts
    pos = len(list((RAW / "ozgenel").rglob("Positive/*")))
    neg = len(list((RAW / "ozgenel").rglob("Negative/*")))
    c500 = len(list((RAW / "crack500").rglob("CRACK500/*/images/*")))
    other = len(list((RAW / "imagenette").rglob("*.JPEG")))
    print(f"\nozgenel Positive (facade crack): {pos}")
    print(f"ozgenel Negative (clean concrete): {neg}")
    print(f"crack500 asphalt images:          {c500}")
    print(f"imagenette 'other' photos:        {other}")
    if pos < 100 or neg < 100 or c500 < 50 or other < 100:
        print("WARNING: unexpectedly low counts; check downloads.", file=sys.stderr)
        sys.exit(1)
    print(f"\nraw data ready under {RAW}")
    print("next: python3 cracks/prepare_data.py")


if __name__ == "__main__":
    main()
