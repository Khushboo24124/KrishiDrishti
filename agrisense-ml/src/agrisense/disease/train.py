"""Train the disease classifier on cached handcrafted features.

Usage:
    python -m agrisense.disease.extract --root data/new-plant-diseases-dataset
    python -m agrisense.disease.train

Run extract first; this script reads the cached .npz so you can iterate on
models in seconds instead of re-reading 88k JPEGs each time.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.decomposition import PCA
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC

from agrisense import metrics
from agrisense.config import ARTIFACTS, MODEL_VERSION

RANDOM_STATE = 42


def candidates(n_features: int) -> dict[str, object]:
    """Classical candidates only. No deep learning, per project constraint.

    LinearSVC has no predict_proba, so it is wrapped in CalibratedClassifierCV
    below -- which is what gives us a usable confidence number anyway.
    """
    return {
        "logreg": Pipeline([
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(max_iter=3000, C=1.0)),
        ]),
        "linear_svc": Pipeline([
            ("scale", StandardScaler()),
            ("clf", LinearSVC(C=1.0, dual="auto", max_iter=5000, random_state=RANDOM_STATE)),
        ]),
        "random_forest": RandomForestClassifier(
            n_estimators=400, min_samples_leaf=2, n_jobs=-1, random_state=RANDOM_STATE
        ),
        "hist_gradient_boosting": HistGradientBoostingClassifier(
            max_iter=300, learning_rate=0.1, random_state=RANDOM_STATE
        ),
        "pca_svc": Pipeline([
            ("scale", StandardScaler()),
            ("pca", PCA(n_components=min(120, n_features), random_state=RANDOM_STATE)),
            ("clf", LinearSVC(C=1.0, dual="auto", max_iter=5000, random_state=RANDOM_STATE)),
        ]),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Train the AgriSense disease model")
    ap.add_argument("--features", default=None, help="path to disease_features.npz")
    ap.add_argument("--out", default=None)
    ap.add_argument(
        "--calibration", default="sigmoid", choices=["sigmoid", "isotonic", "none"],
        help="sigmoid is the safe default for many classes with few samples each",
    )
    args = ap.parse_args()

    out_dir = Path(args.out) if args.out else ARTIFACTS
    out_dir.mkdir(parents=True, exist_ok=True)
    cache = Path(args.features) if args.features else out_dir / "disease_features.npz"
    if not cache.exists():
        raise FileNotFoundError(
            f"{cache} not found. Run first:\n"
            f"  python -m agrisense.disease.extract --root data/new-plant-diseases-dataset"
        )

    d = np.load(cache, allow_pickle=True)
    X_tr, y_tr, X_te, y_te = d["X_train"], d["y_train"], d["X_test"], d["y_test"]
    classes = sorted(set(y_tr.tolist()))
    print("=" * 68)
    print("FEATURE CACHE")
    print("=" * 68)
    print(f"train={X_tr.shape}  test={X_te.shape}  classes={len(classes)}")

    print("\n" + "=" * 68)
    print("MODEL BAKE-OFF (held-out, leakage-free grouped split)")
    print("=" * 68)
    print(f"  {'model':<26} {'acc':>7} {'macroF1':>9} {'fit(s)':>8}")
    print("  " + "-" * 54)

    scored = []
    for name, model in candidates(X_tr.shape[1]).items():
        t0 = time.time()
        try:
            model.fit(X_tr, y_tr)
            pred = model.predict(X_te)
            acc = accuracy_score(y_te, pred)
            mf1 = f1_score(y_te, pred, average="macro", zero_division=0)
            took = time.time() - t0
            scored.append({"name": name, "model": model, "acc": acc, "macro_f1": mf1, "seconds": took})
            print(f"  {name:<26} {acc:>7.4f} {mf1:>9.4f} {took:>8.1f}")
        except Exception as exc:  # a candidate failing must not kill the run
            print(f"  {name:<26} FAILED: {type(exc).__name__}: {exc}")

    if not scored:
        raise RuntimeError("every candidate failed to train")
    scored.sort(key=lambda r: -r["macro_f1"])
    best_name = scored[0]["name"]
    print(f"\n  --> best by macro-F1: {best_name} ({scored[0]['macro_f1']:.4f})")

    # ---- Calibrate the winner. Uncalibrated scores must never be shown.
    print("\n" + "=" * 68)
    print(f"CALIBRATING {best_name} ({args.calibration})")
    print("=" * 68)
    base = candidates(X_tr.shape[1])[best_name]
    if args.calibration == "none":
        final = base.fit(X_tr, y_tr)
    else:
        final = CalibratedClassifierCV(base, method=args.calibration, cv=3)
        final.fit(X_tr, y_tr)

    proba = final.predict_proba(X_te)
    est_classes = list(final.classes_)
    y_idx = np.array([est_classes.index(v) for v in y_te])
    pred = np.array(est_classes)[proba.argmax(axis=1)]
    correct = (pred == y_te).astype(float)
    top1, _ = metrics.top1_top2(proba)

    acc = accuracy_score(y_te, pred)
    mf1 = f1_score(y_te, pred, average="macro", zero_division=0)
    ece = metrics.expected_calibration_error(top1, correct)
    brier = metrics.multiclass_brier(proba, y_idx)
    print(f"accuracy={acc:.4f}  macroF1={mf1:.4f}  ECE={ece:.4f}  Brier={brier:.4f}")

    print("\n" + "=" * 68)
    print("PER-CLASS REPORT")
    print("=" * 68)
    print(classification_report(y_te, pred, zero_division=0))

    print("=" * 68)
    print("RELIABILITY (stated confidence vs. observed accuracy)")
    print("=" * 68)
    for row in metrics.reliability_table(top1, correct):
        print(f"  {row['bin']:<14} n={row['n']:<7} "
              f"stated={row['mean_confidence']:.4f}  observed={row['observed_accuracy']:.4f}")

    print("\n" + "=" * 68)
    print("THRESHOLD SWEEP --> use this to set configs/routing.yaml [disease]")
    print("=" * 68)
    sweep = metrics.threshold_sweep(proba, y_idx)
    print(metrics.format_sweep(sweep))

    bundle = {
        "estimator": final,
        "classes": est_classes,
        "model_version": f"disease-{best_name}-{MODEL_VERSION}",
        "image_size": int(json.loads((out_dir / "disease_features_meta.json").read_text())["image_size"])
        if (out_dir / "disease_features_meta.json").exists() else 128,
    }
    model_path = out_dir / "disease_model.joblib"
    joblib.dump(bundle, model_path)

    report = {
        "model_version": bundle["model_version"],
        "selected": {"algorithm": best_name, "calibration": args.calibration},
        "bake_off": [
            {k: (round(v, 4) if isinstance(v, float) else v)
             for k, v in r.items() if k != "model"} for r in scored
        ],
        "test_metrics": {
            "accuracy": round(float(acc), 4),
            "macro_f1": round(float(mf1), 4),
            "ece": round(float(ece), 4),
            "brier": round(float(brier), 4),
        },
        "reliability": metrics.reliability_table(top1, correct),
        "threshold_sweep": sweep,
        "limitations": [
            "Trained on PlantVillage-derived laboratory images: a single leaf on "
            "a uniform background. Published work reports that models trained on "
            "this data fall below 40% accuracy on real field photographs.",
            "The number above is therefore an upper bound for lab-like uploads, "
            "NOT an estimate of field performance.",
            "Run scripts/eval_field.py against PlantDoc before claiming any "
            "real-world accuracy figure.",
        ],
    }
    (out_dir / "disease_report.json").write_text(json.dumps(report, indent=2))
    print(f"\n[saved] {model_path}")
    print(f"[saved] {out_dir / 'disease_report.json'}")


if __name__ == "__main__":
    main()
