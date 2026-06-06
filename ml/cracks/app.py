"""
Hackathon demo: drag-and-drop crack inspection (two specialists).

Pick the surface (you know it at capture time: a drone points at a facade or a
road), drop a photo, and get a colour-coded crack heatmap, the % of surface
flagged as cracked, and the whole-image class confidences.

Run:
    ./.venv/bin/python cracks/app.py            # local at http://localhost:7860
    ./.venv/bin/python cracks/app.py --share    # public shareable link

Needs both checkpoints: cracks/artifacts/model_facade.pt and model_asphalt.pt
(run train.py --domain facade and --domain asphalt first).
"""
import argparse
from pathlib import Path

import gradio as gr
import torch

from dataset import build_transforms
from infer import classify_pil, heatmap_pil, load_model, ckpt_path
from labels import DOMAINS

HERE = Path(__file__).resolve().parent
EXAMPLES = HERE / "examples"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
TF = build_transforms(train=False)

# Load both specialists once.
MODELS = {}
for d in DOMAINS:
    p = ckpt_path(d)
    if p.exists():
        MODELS[d], _, _ = load_model(p, DEVICE)

DESC = """
# Crack Inspector (HK Building & Street Risk)

Satellite imagery cannot resolve mm-scale cracks (roughly 90x to 900x too
coarse, and facades are invisible to nadir sensors), so inspection runs on
drone / close-range imagery. Two specialist models: one for **building
facades**, one for **road asphalt**. Each also has an **other** class so
non-surface photos (a dog, a person) are not flagged as cracks.

Pick the surface, then drop a photo.
"""


def inspect(image, surface):
    if image is None:
        return None, {}, "Upload a photo to inspect."
    if surface not in MODELS:
        return None, {}, f"Model for '{surface}' not found. Train it first."
    model = MODELS[surface]
    overlay, stats = heatmap_pil(model, TF, DEVICE, image, surface,
                                 tile=224, stride=112, min_conf=0.5)
    probs = classify_pil(model, TF, DEVICE, image)
    summary = (
        f"**Surface:** {surface}  \n"
        f"**Cracked:** {stats['pct_cracked']}% of surface "
        f"({stats['crack_tiles']} / {stats['tiles']} tiles)  \n"
        f"**Whole-image verdict:** {max(probs, key=probs.get)}  \n"
        f"_device: {DEVICE}_"
    )
    return overlay, probs, summary


def build_ui():
    with gr.Blocks(title="Crack Inspector") as demo:
        gr.Markdown(DESC)
        with gr.Row():
            with gr.Column():
                surface = gr.Radio(DOMAINS, value=DOMAINS[0], label="Surface")
                inp = gr.Image(type="pil", label="Drone / phone photo")
                btn = gr.Button("Inspect", variant="primary")
                if EXAMPLES.is_dir():
                    ex = sorted(str(p) for p in EXAMPLES.glob("*")
                                if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
                    if ex:
                        gr.Examples(examples=ex, inputs=inp, label="Examples")
            with gr.Column():
                out_img = gr.Image(label="Crack heatmap", type="pil")
                out_lab = gr.Label(label="Whole-image class confidence")
                out_md = gr.Markdown()
        btn.click(inspect, [inp, surface], [out_img, out_lab, out_md])
        inp.change(inspect, [inp, surface], [out_img, out_lab, out_md])
        surface.change(inspect, [inp, surface], [out_img, out_lab, out_md])
    return demo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--share", action="store_true")
    ap.add_argument("--port", type=int, default=7860)
    args = ap.parse_args()
    print(f"loaded specialists: {list(MODELS)} on {DEVICE}")
    build_ui().launch(server_name="0.0.0.0", server_port=args.port,
                      share=args.share)


if __name__ == "__main__":
    main()
