"""
Baseline inspection-risk ranker for Hong Kong buildings.

IMPORTANT: trains ONLY on the 30+ year cohort. The DS2 label (MBIS-style
inspection/repair notices) is age-gated: ~0 notices under 30 years, rising to
~12% at 50+. Training on the full stock just relearns "old = flagged" and
drowns the features that actually carry signal (InSAR subsidence, use,
structure, location). So we model WITHIN the at-risk cohort.

Pure-numpy logistic regression (no sklearn): score = ranking, interpretable
coefficients = explanation. Leaves a slot for the InSAR velocity feature:
if model/insar_features.csv exists it is merged in automatically.

Run: python3 model/train_baseline.py
"""
import numpy as np
import pandas as pd

FEATURES = "model/building_features.csv"
INSAR = "model/insar_features.csv"   # optional; merged if present
HEIGHT = "model/height_features.csv"  # optional; merged if present
OUT = "model/scored.csv"
MIN_AGE = 30
SEED = 1


def average_precision(y, s):
    order = np.argsort(-s)
    y = y[order]
    tp = np.cumsum(y)
    prec = tp / np.arange(1, len(y) + 1)
    P = y.sum()
    return float((prec * y).sum() / P) if P else 0.0


def main():
    df = pd.read_csv(FEATURES)
    df = df[df.age >= MIN_AGE].dropna(subset=["age"]).reset_index(drop=True)

    cols_num = ["age"]
    if pd.io.common.file_exists(INSAR):
        ins = pd.read_csv(INSAR)[["OBJECTID", "insar_velocity_mm_yr"]]
        df = df.merge(ins, on="OBJECTID", how="left")
        df["insar_missing"] = df.insar_velocity_mm_yr.isna().astype(int)
        df["insar_velocity_mm_yr"] = df.insar_velocity_mm_yr.fillna(
            df.insar_velocity_mm_yr.median())
        cols_num += ["insar_velocity_mm_yr", "insar_missing"]
        print("merged InSAR feature.")
    else:
        print("no InSAR yet (model/insar_features.csv missing).")

    if pd.io.common.file_exists(HEIGHT):
        h = pd.read_csv(HEIGHT)[["OBJECTID", "building_height_m", "storeys"]]
        df = df.merge(h, on="OBJECTID", how="left")
        for col in ["building_height_m", "storeys"]:
            df[col] = df[col].fillna(df[col].median())
        cols_num += ["building_height_m", "storeys"]
        print("merged height features.")
    else:
        print("no height yet (model/height_features.csv missing).")

    # design matrix: standardized numerics + one-hot categoricals
    Xn = df[cols_num].astype(float)
    Xn = (Xn - Xn.mean()) / Xn.std(ddof=0).replace(0, 1)
    Xc = pd.get_dummies(df[["use_class", "structure", "district"]].astype(str),
                        drop_first=True)
    X = np.c_[np.ones(len(df)), Xn.values, Xc.values.astype(float)]
    names = ["bias"] + cols_num + list(Xc.columns)
    y = df.label.values.astype(float)

    # stratified 80/20 split
    rng = np.random.default_rng(SEED)
    pos, neg = np.where(y == 1)[0], np.where(y == 0)[0]
    rng.shuffle(pos); rng.shuffle(neg)
    te = np.r_[pos[:len(pos)//5], neg[:len(neg)//5]]
    tr = np.r_[pos[len(pos)//5:], neg[len(neg)//5:]]

    # class-balanced logistic regression via gradient descent + L2
    w = np.zeros(X.shape[1])
    sw = np.where(y == 1, (y == 0).sum() / max((y == 1).sum(), 1), 1.0)
    lr, l2 = 0.5, 1e-3
    for _ in range(3000):
        p = 1 / (1 + np.exp(-X[tr] @ w))
        g = X[tr].T @ (sw[tr] * (p - y[tr])) / len(tr) + l2 * w
        w -= lr * g

    s = 1 / (1 + np.exp(-X @ w))
    ap = average_precision(y[te], s[te])
    base = y[te].mean()
    print(f"\ncohort: {len(df)} buildings (age>={MIN_AGE}), "
          f"{int(y.sum())} positive ({base*100:.1f}% test base rate)")
    print(f"test PR-AUC (avg precision): {ap:.3f}")
    order = np.argsort(-s[te]); yt = y[te][order]
    for k in (100, 300, 500):
        k = min(k, len(yt))
        pk = yt[:k].mean()
        print(f"  precision@{k}: {pk*100:4.1f}%   lift: {pk/base:4.1f}x")

    coef = sorted(zip(names, w), key=lambda t: -abs(t[1]))
    print("\ntop coefficients (standardized; sign = risk direction):")
    for n_, c in coef[:12]:
        print(f"  {c:+.2f}  {n_}")

    df["risk_score"] = (s * 100).round(1)
    df.sort_values("risk_score", ascending=False)[
        ["OBJECTID", "age", "use_class", "structure", "district",
         "LATITUDE", "LONGITUDE", "label", "risk_score"]
    ].to_csv(OUT, index=False)
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
