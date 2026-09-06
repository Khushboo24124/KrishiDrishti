"""Train and evaluate the crop recommendation model.

Usage:
    python -m agrisense.crop.train --csv data/Crop_recommendation.csv

Model selection note
--------------------
On this dataset almost every classifier reaches ~99% accuracy, so accuracy
cannot choose between them. We select on calibration (ECE / Brier) instead:
we need the probability to be *meaningful*, because the routing layer spends
that probability. A model that is 99% accurate but always says 1.00 is
useless to us; it can never trigger a review.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import (
    ExtraTreesClassifier,
    HistGradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from agrisense import metrics
from agrisense.config import ARTIFACTS, MODEL_VERSION, routing_config
from agrisense.crop import data as cropdata
from agrisense.crop.ood import NoveltyDetector

RANDOM_STATE = 42


def candidates() -> dict[str, object]:
    """Classical candidates only -- no deep learning, per project constraint."""
    return {
        "random_forest": RandomForestClassifier(
            n_estimators=500, random_state=RANDOM_STATE, n_jobs=-1
        ),
        "extra_trees": ExtraTreesClassifier(
            n_estimators=500, random_state=RANDOM_STATE, n_jobs=-1
        ),
        "hist_gradient_boosting": HistGradientBoostingClassifier(
            random_state=RANDOM_STATE
        ),
        # SVC has no native predict_proba. Wrapping it in CalibratedClassifierCV
        # (ensemble=False) is sklearn's recommended replacement for the
        # deprecated SVC(probability=True), and works across 1.4-1.9+.
        "svm_rbf": Pipeline(
            [
                ("scale", StandardScaler()),
                ("clf", CalibratedClassifierCV(
                    SVC(C=10, gamma="scale", random_state=RANDOM_STATE),
                    method="sigmoid", cv=3, ensemble=False,
                )),
            ]
        ),
        "logistic_regression": Pipeline(
            [
                ("scale", StandardScaler()),
                ("clf", LogisticRegression(max_iter=2000, C=1.0)),
            ]
        ),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Train the AgriSense crop model")
    ap.add_argument("--csv", default="data/Crop_recommendation.csv")
    ap.add_argument("--test-size", type=float, default=0.2)
    ap.add_argument("--out", default=None, help="artifact directory")
    args = ap.parse_args()

    out_dir = Path(args.out) if args.out else ARTIFACTS
    out_dir.mkdir(parents=True, exist_ok=True)

    df = cropdata.load(args.csv)
    print("=" * 68)
    print("DATASET PROFILE")
    print("=" * 68)
    print(cropdata.describe(df))

    X = df[cropdata.FEATURES].to_numpy(dtype=float)
    y = df[cropdata.TARGET].to_numpy()

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=args.test_size, stratify=y, random_state=RANDOM_STATE
    )

    # ---- 1. Bake-off on cross-validated accuracy (a screen, not the decision)
    print("\n" + "=" * 68)
    print("MODEL BAKE-OFF (5-fold stratified CV on the training split)")
    print("=" * 68)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    cv_results = {}
    for name, model in candidates().items():
        t0 = time.time()
        scores = cross_val_score(model, X_tr, y_tr, cv=cv, scoring="accuracy", n_jobs=-1)
        cv_results[name] = {
            "cv_accuracy_mean": round(float(scores.mean()), 4),
            "cv_accuracy_std": round(float(scores.std()), 4),
            "fit_seconds": round(time.time() - t0, 2),
        }
        print(
            f"  {name:<24} acc={scores.mean():.4f} +/- {scores.std():.4f} "
            f"({time.time() - t0:.1f}s)"
        )

    # ---- 2. Calibration decides the winner
    print("\n" + "=" * 68)
    print("CALIBRATION COMPARISON (held-out test split)")
    print("Accuracy is saturated here; the probability quality is what matters.")
    print("=" * 68)
    print(f"  {'model':<34} {'acc':>7} {'ECE':>8} {'Brier':>8}")
    print("  " + "-" * 60)

    best = None
    for name, model in candidates().items():
        for calib in ("none", "sigmoid", "isotonic"):
            if calib == "none":
                est = model
            else:
                # cv=5 refits internally on the training split only.
                est = CalibratedClassifierCV(model, method=calib, cv=5)
            est.fit(X_tr, y_tr)
            proba = est.predict_proba(X_te)
            classes = list(est.classes_)
            y_idx = np.array([classes.index(v) for v in y_te])
            pred = np.array(classes)[proba.argmax(axis=1)]

            acc = accuracy_score(y_te, pred)
            top1, _ = metrics.top1_top2(proba)
            ece = metrics.expected_calibration_error(top1, (pred == y_te).astype(float))
            brier = metrics.multiclass_brier(proba, y_idx)

            label = f"{name}+{calib}"
            print(f"  {label:<34} {acc:>7.4f} {ece:>8.4f} {brier:>8.4f}")
            cv_results.setdefault(name, {})[f"{calib}_ece"] = round(ece, 4)

            # Rank by Brier (proper scoring rule), tie-break on accuracy.
            key = (brier, -acc)
            if best is None or key < best["key"]:
                best = {
                    "key": key, "name": name, "calibration": calib,
                    "estimator": est, "accuracy": acc, "ece": ece, "brier": brier,
                    "proba": proba, "y_idx": y_idx, "classes": classes, "pred": pred,
                }

    assert best is not None
    print(
        f"\n  --> selected: {best['name']} + {best['calibration']} calibration"
        f"  (Brier={best['brier']:.4f}, ECE={best['ece']:.4f}, acc={best['accuracy']:.4f})"
    )

    # ---- 3. Report
    print("\n" + "=" * 68)
    print("CLASSIFICATION REPORT (selected model, held-out test split)")
    print("=" * 68)
    print(classification_report(y_te, best["pred"], zero_division=0))

    print("=" * 68)
    print("RELIABILITY (stated confidence vs. observed accuracy)")
    print("=" * 68)
    top1, _ = metrics.top1_top2(best["proba"])
    correct = (best["pred"] == y_te).astype(float)
    for row in metrics.reliability_table(top1, correct):
        print(
            f"  {row['bin']:<14} n={row['n']:<6} "
            f"stated={row['mean_confidence']:.4f}  observed={row['observed_accuracy']:.4f}"
        )

    print("\n" + "=" * 68)
    print("THRESHOLD SWEEP  --> use this to set configs/routing.yaml [crop]")
    print("=" * 68)
    sweep = metrics.threshold_sweep(best["proba"], best["y_idx"])
    print(metrics.format_sweep(sweep))

    # ---- 4. Novelty gate, fitted on training features only
    cfg = routing_config()["crop"]
    novelty = NoveltyDetector.fit(X_tr, percentile=float(cfg["ood_percentile"]))
    flagged = novelty.is_novel(X_te).mean()
    print(
        f"\n[ood] novelty gate fitted (percentile={cfg['ood_percentile']}, "
        f"threshold={novelty.threshold:.4f}); flags {flagged:.2%} of the held-out split"
    )

    # ---- 5. Persist
    bundle = {
        "estimator": best["estimator"],
        "novelty": novelty,
        "classes": best["classes"],
        "features": cropdata.FEATURES,
        "model_version": f"crop-{best['name']}-{MODEL_VERSION}",
    }
    model_path = out_dir / "crop_model.joblib"
    joblib.dump(bundle, model_path)

    report = {
        "model_version": bundle["model_version"],
        "selected": {"algorithm": best["name"], "calibration": best["calibration"]},
        "dataset": {
            "path": str(args.csv),
            "rows": int(len(df)),
            "classes": int(df[cropdata.TARGET].nunique()),
            "provenance_warning": (
                "Synthetic/augmented from Indian rainfall, climate and fertilizer "
                "references. Not observed planting outcomes. Do not present as "
                "evidence a crop will succeed on a specific farm."
            ),
        },
        "test_metrics": {
            "accuracy": round(float(best["accuracy"]), 4),
            "macro_f1": round(float(f1_score(y_te, best["pred"], average="macro")), 4),
            "ece": round(float(best["ece"]), 4),
            "brier": round(float(best["brier"]), 4),
        },
        "cv_results": cv_results,
        "reliability": metrics.reliability_table(top1, correct),
        "threshold_sweep": sweep,
        "novelty_gate": {
            "percentile": novelty.percentile,
            "threshold": round(novelty.threshold, 6),
            "flagged_fraction_test": round(float(flagged), 4),
        },
    }
    report_path = out_dir / "crop_report.json"
    report_path.write_text(json.dumps(report, indent=2))

    print(f"\n[saved] {model_path}")
    print(f"[saved] {report_path}")
    print(
        "\nNEXT: read the threshold sweep above, then set high_confidence / "
        "high_margin / review_floor in configs/routing.yaml [crop]."
    )


if __name__ == "__main__":
    main()
