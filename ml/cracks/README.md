# Crack detection (facade + asphalt)

A drone / close-range imagery crack classifier for the HK building-and-street
risk platform. It labels an image patch as one of:

**Two specialist models, one per surface domain** (`facade`, `asphalt`), each a
3-class detector:

| class | meaning |
|-------|---------|
| `none` | clean surface of that domain |
| `crack` | a crack on that domain's surface |
| `other` | not a surface at all (person, animal, sky, vehicle, ...) |

A full photo is scored by sliding a window over it and colour-coding each
`crack` tile (red for facade, orange for asphalt); `none` and `other` are left
unshaded.

### Why two specialists, not one multi-class model

Surface type (facade vs asphalt) is known at capture time (a drone points at a
wall or at a road), and the two feed different downstream teams with different
severity thresholds. Baking surface type into the labels (`facade_crack` vs
`asphalt_crack`) made the model spend capacity on a distinction you already have
as metadata, and let it "cheat" on dataset texture. Splitting into two
specialists, routed by the known surface, keeps each model focused on the real
question (crack / no-crack) and allows per-domain operating points. The earlier
single multi-class model is kept in git history if you want to compare.

### Why the `other` class exists

A crack/no-crack softmax is closed-set: every input is forced into a class, so a
non-surface photo (a dog, a person, the sky) gets dumped into the crack or none
class, often confidently. Measured on held-out dog photos, an early model
flagged 70% of them as a crack. Adding an `other` / not-a-surface class (trained
on Imagenette, shared by both specialists) gives an out-of-distribution sink:
the same dog set then lands in `other` 100% of the time (0% false cracks) on
both specialists, with no loss of crack accuracy. For production, harden further
(more diverse negatives, a confidence/energy-based reject option).

## Why not satellite imagery

We evaluated detecting cracks directly from satellite imagery first. It is not
feasible, for two independent reasons:

1. **Resolution.** Cracks we care about are roughly 0.1 to 20 mm wide. The best
   commercial native optical GSD is about 30 cm (Maxar WorldView-3/Legion,
   Pleiades Neo); the bleeding edge (Albedo, about 10 cm) is not yet at scale. A
   linear feature must span about 3 pixels to be detectable, so crack detection
   needs sub-millimetre GSD. Satellite is roughly 90x to 900x too coarse. The
   entire crack literature works at about 1 mm/px (e.g. the GAPs pavement set is
   1.2 mm/px).
2. **Geometry (facades).** Satellites image near-nadir; facades are vertical and
   present near-zero projected area, so they are essentially invisible. Oblique
   very-high-res only adds foreshortening and lower effective resolution, and
   HK's high-rise canyons occlude facades anyway.

No published work does true crack detection (pavement or facade) from satellite.
The closest is coarse road-condition / PCI screening at 50 cm (about 0.93 F1),
which its authors explicitly note is "insufficient for detecting smaller
pavement cracks." So the honest, viable acquisition modality is drone /
close-range imagery (about 1 mm/px), which is what this model is trained for. A
coarse satellite road-condition prioritisation layer remains a legitimate,
separate add-on to the risk ranker, but it is not crack detection.

## Data

Assembled from two open datasets (Hugging Face mirrors, no login):

- **Ozgenel "Concrete Crack Images for Classification"** (40k 227x227 patches).
  `Positive` becomes `facade_crack`, `Negative` becomes `none`. Mirror:
  `huggingface.co/datasets/mohammadnajeeb/concrete_crack_images`.
- **CRACK500** (asphalt pavement, image + binary mask pairs), bundled in
  `huggingface.co/datasets/xcll/crack500_and_deepcrack`. Tiled into overlapping
  224 px patches: crack tiles become `asphalt_crack`, clean tiles become `none`.

Notes and honest caveats:
- The canonical hosts were unusable here (USU DigitalCommons for SDNET2018 sits
  behind an Imperva bot-wall; the Ozgenel original is a `.rar` with no extractor
  in this environment), so we use the HF mirrors.
- CRACK500 patches are split by source image, so overlapping near-duplicate
  tiles never leak across train/test.
- `asphalt_crack` is the data-limited class (about 5.5k tiles from 110 source
  photos). Classes are capped at `--max-per-class` and a class-weighted loss
  handles residual imbalance. For production, fine-tune on drone-captured HK
  asphalt and facade imagery.

## Pipeline

```
cracks/
  download_data.py   # fetch Ozgenel + CRACK500 from HF  -> data/raw/
  prepare_data.py    # build the balanced 3-class manifest -> data/manifest.csv
  dataset.py         # torch Dataset + transforms
  model.py           # EfficientNet-B0 / ResNet-50 + 3-class head
  train.py           # GPU training, class-weighted CE, saves metrics + confusion matrix
  infer.py           # single-patch classify OR sliding-window heatmap overlay
  labels.py          # the 3 classes (shared)
```

## Setup

This module needs a CUDA build of PyTorch (the repo's base env is CPU-only), so
it uses its own venv at `.venv/`:

```bash
python3 -m venv --system-site-packages .venv
./.venv/bin/python -m pip install \
  torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
./.venv/bin/python -m pip install pillow scikit-learn tqdm matplotlib
```

## Run

```bash
./.venv/bin/python cracks/download_data.py        # about 460 MB
./.venv/bin/python cracks/prepare_data.py
./.venv/bin/python cracks/train.py --domain facade    # ~5 min on an RTX 4060
./.venv/bin/python cracks/train.py --domain asphalt   # ~5 min
./.venv/bin/python cracks/infer.py --domain asphalt --image <road.jpg>          # heatmap
./.venv/bin/python cracks/infer.py --domain facade --image <patch.jpg> --single # one patch
```

Artifacts land in `cracks/artifacts/`, suffixed by domain: `model_<domain>.pt`,
`metrics_<domain>.json`, `confusion_matrix_<domain>.png`, and `overlay.png` from
inference.

## Demo (hackathon)

A drag-and-drop web app (Gradio). Pick the surface (facade or asphalt), drop a
drone/phone photo, and get a crack heatmap, the whole-image verdict, and the %
of the surface flagged as cracked.

```bash
./.venv/bin/python -m pip install gradio
./.venv/bin/python cracks/app.py            # http://localhost:7860
./.venv/bin/python cracks/app.py --share    # public link for judges' phones
```

Populate `cracks/examples/` with a few sample photos for one-click demos (it is
gitignored to avoid redistributing dataset imagery). The app also accepts any
uploaded image. Each specialist is ~16 MB (EfficientNet-B0, 4.0M params): ~40 ms
per patch on CPU, sub-second full-image heatmaps on GPU, so it runs on a laptop
with no GPU.

Product story: the risk map ranks which buildings/streets to inspect, a drone
captures close-range imagery, and these models auto-flag the cracks.

## Results

See `cracks/artifacts/metrics_<domain>.json` (regenerated each run). On the
held-out test split: the **facade** specialist reaches accuracy 1.00 / macro-F1
1.00, the **asphalt** specialist accuracy 0.99 / macro-F1 0.99 (crack F1 0.98).
Both reject held-out dog photos to `other` 100% of the time (0% false cracks).
Numbers are patch-level on clean benchmark imagery; real drone footage (blur,
shadows, varied surfaces) will be harder, and segmentation for mm crack-width is
the documented phase 2.
