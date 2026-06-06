# ML & data pipelines

Everything that produces the risk data the apps consume: raw datasets, feature
engineering, the InSAR ground-deformation pipeline, the crack-detection model,
and the baseline scoring model. Outputs land as CSV / SQL that get imported into
the shared Supabase database (see `../supabase`).

Python is managed with [uv](https://docs.astral.sh/uv/) (`pyproject.toml`,
`uv.lock`, `.python-version`). Scripts use paths **relative to this `ml/`
directory**, so run them from here:

```bash
cd ml
uv sync
uv run python model/build_features.py
```

## Layout

```
ml/
├── data-analysis/      # raw datasets (CSV), exploration notebooks, sources
│   ├── DS1_all.csv             # building inventory
│   ├── DS2_inspection.csv      # inspection records
│   ├── *.ipynb                 # exploration / overview / insar notebooks
│   └── sources.md
├── model/              # feature engineering + baseline scoring
│   ├── build_features.py
│   ├── fetch_heights.py
│   ├── train_baseline.py
│   └── *.csv / *.sql           # generated features & scores
├── insar/              # InSAR ground-deformation pipeline (HyP3 + MintPy)
│   ├── find_bursts.py / submit_hyp3.py / download_hyp3.py
│   ├── run_mintpy.py / sample_velocity.py / velocity_gradient.py
│   └── hk_insar.cfg
└── cracks/             # facade + asphalt crack-detection model (PyTorch)
    ├── train.py / infer.py / app.py
    └── dataset.py / model.py / prepare_data.py
```

Each subdirectory keeps its own `README.md` with module-specific details.
