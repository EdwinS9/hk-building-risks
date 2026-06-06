"""
Train the 3-class crack classifier (none / facade_crack / asphalt_crack).

Transfer learning on an ImageNet-pretrained backbone (EfficientNet-B0 by
default), class-balanced cross-entropy, early-ish stopping on val macro-F1.
Saves the best checkpoint + a metrics report + a confusion-matrix PNG.

One specialist per surface domain (facade or asphalt). Each is a 3-class
{none, crack, other} detector trained on its own domain's rows plus the shared
'other' class.

Run (GPU), train both specialists:
    ./.venv/bin/python cracks/train.py --domain facade
    ./.venv/bin/python cracks/train.py --domain asphalt
Options:
    --arch efficientnet_b0|resnet50   --epochs 8   --batch 64   --lr 3e-4
    --freeze            train only the classifier head (fast, lower ceiling)
    --smoke             tiny subset + 1 epoch, just to prove the loop runs

Outputs (cracks/artifacts/), suffixed by domain:
    model_<domain>.pt            best checkpoint (weights + arch + domain + classes)
    metrics_<domain>.json        per-class precision/recall/F1, macro-F1, accuracy
    confusion_matrix_<domain>.png
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Subset
from sklearn.metrics import (classification_report, confusion_matrix,
                             f1_score)

from dataset import CrackDataset, class_weights
from labels import CLASSES, DOMAINS
from model import build_model

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "data" / "manifest.csv"
ART = HERE / "artifacts"


def loader(domain, split, train_aug, batch, smoke=False, workers=4):
    ds = CrackDataset(MANIFEST, domain, split, train_aug)
    if smoke:
        k = min(len(ds), 256)
        ds = Subset(ds, list(range(k)))
    return DataLoader(ds, batch_size=batch, shuffle=train_aug,
                      num_workers=workers, pin_memory=True, drop_last=False)


@torch.no_grad()
def evaluate(model, dl, device):
    model.eval()
    ys, ps = [], []
    for x, y in dl:
        logits = model(x.to(device))
        ps.append(logits.argmax(1).cpu().numpy())
        ys.append(y.numpy())
    y = np.concatenate(ys)
    p = np.concatenate(ps)
    return y, p


def save_confusion(y, p, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    cm = confusion_matrix(y, p, labels=range(len(CLASSES)))
    fig, ax = plt.subplots(figsize=(5, 4.5))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(CLASSES)), CLASSES, rotation=45, ha="right")
    ax.set_yticks(range(len(CLASSES)), CLASSES)
    ax.set_xlabel("predicted"); ax.set_ylabel("true")
    thresh = cm.max() / 2 if cm.max() else 0
    for i in range(len(CLASSES)):
        for j in range(len(CLASSES)):
            ax.text(j, i, str(cm[i, j]), ha="center",
                    color="white" if cm[i, j] > thresh else "black")
    fig.colorbar(im); fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain", required=True, choices=DOMAINS)
    ap.add_argument("--arch", default="efficientnet_b0")
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--freeze", action="store_true")
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    domain = args.domain

    if not MANIFEST.exists():
        raise SystemExit("manifest missing - run cracks/prepare_data.py first")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    epochs = 1 if args.smoke else args.epochs
    print(f"domain={domain}  device={device}  arch={args.arch}  epochs={epochs}  "
          f"batch={args.batch}  freeze={args.freeze}  smoke={args.smoke}")
    if device == "cuda":
        print(f"  gpu: {torch.cuda.get_device_name(0)}")

    tr = loader(domain, "train", True, args.batch, args.smoke, args.workers)
    va = loader(domain, "val", False, args.batch, args.smoke, args.workers)
    te = loader(domain, "test", False, args.batch, args.smoke, args.workers)

    model = build_model(args.arch, freeze_backbone=args.freeze).to(device)
    w = class_weights(MANIFEST, domain).to(device)
    print(f"class weights ({CLASSES}): {w.cpu().numpy().round(3)}")
    crit = nn.CrossEntropyLoss(weight=w)
    opt = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=args.lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(epochs, 1))
    scaler = torch.amp.GradScaler("cuda", enabled=device == "cuda")

    ART.mkdir(parents=True, exist_ok=True)
    best_f1, best_state = -1.0, None
    for ep in range(1, epochs + 1):
        model.train()
        t0 = time.time()
        running = 0.0
        for i, (x, y) in enumerate(tr):
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            opt.zero_grad()
            with torch.autocast(device_type="cuda", enabled=device == "cuda"):
                loss = crit(model(x), y)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            running += loss.item()
            if i % 20 == 0:
                print(f"\r  ep{ep} step {i}/{len(tr)} loss {loss.item():.3f}",
                      end="", flush=True)
        sched.step()
        yv, pv = evaluate(model, va, device)
        f1 = f1_score(yv, pv, average="macro", labels=range(len(CLASSES)),
                      zero_division=0)
        print(f"\r  ep{ep}: train_loss {running/max(len(tr),1):.3f}  "
              f"val_macroF1 {f1:.3f}  ({time.time()-t0:.0f}s)")
        if f1 > best_f1:
            best_f1 = f1
            best_state = {k: v.detach().cpu().clone()
                          for k, v in model.state_dict().items()}

    # restore best, evaluate on test
    if best_state is not None:
        model.load_state_dict(best_state)
    yt, pt = evaluate(model, te, device)
    report = classification_report(
        yt, pt, labels=range(len(CLASSES)), target_names=CLASSES,
        output_dict=True, zero_division=0)
    macro_f1 = f1_score(yt, pt, average="macro", labels=range(len(CLASSES)),
                        zero_division=0)
    acc = float((yt == pt).mean())

    print("\n=== TEST ===")
    print(classification_report(yt, pt, labels=range(len(CLASSES)),
                                target_names=CLASSES, zero_division=0))
    print(f"test accuracy: {acc:.3f}   test macro-F1: {macro_f1:.3f}")

    ckpt_p = ART / f"model_{domain}.pt"
    metrics_p = ART / f"metrics_{domain}.json"
    cm_p = ART / f"confusion_matrix_{domain}.png"
    torch.save({"state_dict": model.state_dict(), "arch": args.arch,
                "domain": domain, "classes": CLASSES}, ckpt_p)
    with open(metrics_p, "w") as fh:
        json.dump({"domain": domain, "arch": args.arch, "epochs": epochs,
                   "test_accuracy": acc, "test_macro_f1": macro_f1,
                   "best_val_macro_f1": best_f1, "per_class": report}, fh, indent=2)
    save_confusion(yt, pt, cm_p)
    print(f"\nsaved: {ckpt_p}, {metrics_p}, {cm_p}")
    print(f"next: ./.venv/bin/python cracks/infer.py --domain {domain} --image <img>")


if __name__ == "__main__":
    main()
