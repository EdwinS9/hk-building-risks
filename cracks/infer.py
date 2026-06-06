"""
Run a trained crack specialist on an image.

Pick the specialist with --domain (facade or asphalt); it loads
cracks/artifacts/model_<domain>.pt. Each specialist outputs none / crack / other.

Two modes:
  - single patch: classify one ~square image.
  - full image (default): slide a window over a large drone/phone photo, classify
    each tile, and render a heatmap overlay (crack tiles only).

Run:
    ./.venv/bin/python cracks/infer.py --domain asphalt --image road.jpg
    ./.venv/bin/python cracks/infer.py --domain facade --image patch.jpg --single
"""
import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from dataset import build_transforms
from labels import CLASSES, DOMAIN_CRACK_COLOR, IDX_TO_CLASS
from model import build_model

HERE = Path(__file__).resolve().parent
ART = HERE / "artifacts"


def ckpt_path(domain: str) -> Path:
    return ART / f"model_{domain}.pt"


def load_model(path, device: str):
    ckpt = torch.load(path, map_location=device)
    model = build_model(ckpt["arch"]).to(device)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, ckpt.get("domain"), ckpt.get("classes", CLASSES)


@torch.no_grad()
def classify_batch(model, imgs, tf, device):
    x = torch.stack([tf(im) for im in imgs]).to(device)
    return F.softmax(model(x), dim=1).cpu().numpy()


def classify_pil(model, tf, device, im):
    p = classify_batch(model, [im.convert("RGB")], tf, device)[0]
    return {CLASSES[i]: float(p[i]) for i in range(len(CLASSES))}


def heatmap_pil(model, tf, device, im, domain, tile=224, stride=112, min_conf=0.5):
    """Slide a window, classify each tile, overlay 'crack' tiles in the domain
    colour. Returns (overlay_PIL, stats)."""
    im = im.convert("RGB")
    W, H = im.size
    overlay = np.array(im).astype(np.float32)
    color = np.array(DOMAIN_CRACK_COLOR.get(domain, (230, 25, 75)), dtype=np.float32)

    boxes, crops = [], []
    for top in range(0, max(H - tile, 0) + 1, stride):
        for left in range(0, max(W - tile, 0) + 1, stride):
            boxes.append((left, top))
            crops.append(im.crop((left, top, left + tile, top + tile)))

    preds, confs = [], []
    for i in range(0, len(crops), 64):
        probs = classify_batch(model, crops[i:i + 64], tf, device)
        preds.extend(probs.argmax(1).tolist())
        confs.extend(probs.max(1).tolist())

    n_crack = 0
    for (left, top), cls, conf in zip(boxes, preds, confs):
        if IDX_TO_CLASS[cls] != "crack" or conf < min_conf:
            continue
        n_crack += 1
        a = 0.45 * conf
        region = overlay[top:top + tile, left:left + tile]
        overlay[top:top + tile, left:left + tile] = (1 - a) * region + a * color

    n_tiles = max(len(crops), 1)
    stats = {"tiles": len(crops), "crack_tiles": n_crack,
             "pct_cracked": round(100 * n_crack / n_tiles, 1),
             "domain": domain}
    return Image.fromarray(overlay.clip(0, 255).astype(np.uint8)), stats


def single(model, tf, device, image_path):
    probs = classify_pil(model, tf, device, Image.open(image_path))
    for c in sorted(probs, key=probs.get, reverse=True):
        print(f"  {c:7s} {probs[c]*100:5.1f}%")
    print(f"=> {max(probs, key=probs.get)}")


def heatmap(model, tf, device, image_path, domain, tile, stride, out_path):
    overlay, stats = heatmap_pil(model, tf, device, Image.open(image_path),
                                 domain, tile, stride)
    overlay.save(out_path)
    print(f"[{domain}] tiles: {stats['tiles']}  crack tiles: {stats['crack_tiles']}"
          f"  ({stats['pct_cracked']}% of surface)")
    print(f"saved heatmap overlay -> {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain", required=True, choices=list(DOMAIN_CRACK_COLOR))
    ap.add_argument("--image", required=True)
    ap.add_argument("--ckpt")
    ap.add_argument("--single", action="store_true")
    ap.add_argument("--tile", type=int, default=224)
    ap.add_argument("--stride", type=int, default=112)
    ap.add_argument("--out", default=str(ART / "overlay.png"))
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    path = Path(args.ckpt) if args.ckpt else ckpt_path(args.domain)
    model, domain, _ = load_model(path, device)
    domain = domain or args.domain
    tf = build_transforms(train=False)

    if args.single:
        single(model, tf, device, args.image)
    else:
        heatmap(model, tf, device, args.image, domain, args.tile, args.stride,
                args.out)


if __name__ == "__main__":
    main()
