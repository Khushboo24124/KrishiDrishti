"""Quantify the augmentation leakage in the New Plant Diseases dataset.

Trains the SAME model twice on the SAME images, changing only how the split
is drawn:

  A) naive random split  -- what you get by using the dataset's shipped
                            train/ and valid/ folders, or by calling
                            train_test_split on the pooled files.
  B) grouped split       -- all augmentations of one source leaf kept on the
                            same side.

The gap between A and B is the accuracy that leakage was manufacturing. Run
this once and put the number on a slide: it is the difference between an
honest project and a demo that quietly cheats.

Usage:
    python scripts/prove_leakage.py --root data/new-plant-diseases-dataset \
        --max-per-class 200
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from agrisense.disease.extract import extract_many  # noqa: E402
from agrisense.disease.split import cap_by_group, collect, source_group  # noqa: E402


def model() -> Pipeline:
    return Pipeline([("scale", StandardScaler()),
                     ("clf", LogisticRegression(max_iter=3000))])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--max-per-class", type=int, default=200)
    ap.add_argument("--test-size", type=float, default=0.2)
    ap.add_argument("--n-jobs", type=int, default=-1)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    paths, labels = collect(Path(args.root))
    print(f"found {len(paths)} images / {len(set(labels))} classes")

    # Cap by group so both arms see an identical image pool.
    if args.max_per_class:
        paths, labels = cap_by_group(paths, labels, args.max_per_class, args.seed)
    groups_all = np.array([source_group(p) for p in paths])
    n_groups = len(set(groups_all.tolist()))
    print(f"working pool: {len(paths)} images, {n_groups} source groups "
          f"({len(paths) / max(n_groups, 1):.2f} images per group)\n")

    print("extracting features once (both arms reuse them)...")
    X, kept = extract_many(paths, n_jobs=args.n_jobs)
    y = np.array([labels[i] for i in kept])
    g = groups_all[kept]
    idx = np.arange(len(X))

    # --- Arm A: naive random split (leaky)
    ia_tr, ia_te = train_test_split(
        idx, test_size=args.test_size, stratify=y, random_state=args.seed)
    acc_naive = accuracy_score(y[ia_te], model().fit(X[ia_tr], y[ia_tr]).predict(X[ia_te]))
    # Share of test images that had an augmented sibling sitting in train.
    sibling_rate = float(np.isin(g[ia_te], g[ia_tr]).mean())

    # --- Arm B: grouped split (honest)
    ib_tr, ib_te = next(GroupShuffleSplit(
        n_splits=1, test_size=args.test_size, random_state=args.seed
    ).split(X, y, groups=g))
    acc_grouped = accuracy_score(y[ib_te], model().fit(X[ib_tr], y[ib_tr]).predict(X[ib_te]))
    straddling = len(set(g[ib_tr].tolist()) & set(g[ib_te].tolist()))

    print("\n" + "=" * 62)
    print("LEAKAGE MEASUREMENT")
    print("=" * 62)
    print(f"A) naive random split   accuracy = {acc_naive:.4f}")
    print(f"B) grouped split        accuracy = {acc_grouped:.4f}")
    print(f"   inflation from leakage       = {acc_naive - acc_grouped:+.4f} "
          f"({(acc_naive - acc_grouped) * 100:+.2f} points)")
    print(f"\n   in arm A, {sibling_rate:.1%} of test images had an augmented sibling in train")
    print(f"   in arm B, {straddling} source groups straddle the split (must be 0)")
    print("\nReport B. A is the number that flatters the demo and misleads the farmer.")


if __name__ == "__main__":
    main()
