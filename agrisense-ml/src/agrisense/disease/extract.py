"""Parallel feature extraction with an on-disk cache.

Extraction is the slow step (~7 ms/image plus JPEG decode). Training is fast
once features exist, so we extract ONCE into an .npz and then iterate on
models freely. Re-running with the same arguments reuses the cache.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
from joblib import Parallel, delayed

from agrisense.config import ARTIFACTS, DATA
from agrisense.disease import features as F
from agrisense.disease.split import collect, grouped_split


def _safe_extract(path: Path) -> np.ndarray | None:
    """Extract one image; return None on a corrupt/unreadable file."""
    try:
        return F.extract_from_path(path)
    except Exception:
        return None


def extract_many(paths: list[Path], n_jobs: int = -1, batch: int = 256) -> tuple[np.ndarray, list[int]]:
    """Extract features for many paths. Returns (X, kept_indices)."""
    t0 = time.time()
    results = Parallel(n_jobs=n_jobs, batch_size=batch, verbose=5)(
        delayed(_safe_extract)(p) for p in paths
    )
    kept = [i for i, r in enumerate(results) if r is not None]
    failed = len(paths) - len(kept)
    if failed:
        print(f"[extract] skipped {failed} unreadable image(s)")
    X = np.vstack([results[i] for i in kept]).astype(np.float32)
    print(f"[extract] {len(kept)} images -> {X.shape} in {time.time() - t0:.1f}s")
    return X, kept


def main() -> None:
    ap = argparse.ArgumentParser(description="Extract disease image features")
    ap.add_argument(
        "--root",
        default=str(DATA / "new-plant-diseases-dataset"),
        help="dataset root containing train/ and valid/",
    )
    ap.add_argument("--out", default=None, help="artifact directory")
    ap.add_argument("--test-size", type=float, default=0.2)
    ap.add_argument(
        "--max-per-class",
        type=int,
        default=0,
        help="cap images per class (0 = use all). Capping is applied by source "
             "group, so it never reintroduces augmentation leakage.",
    )
    ap.add_argument("--n-jobs", type=int, default=-1)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    out_dir = Path(args.out) if args.out else ARTIFACTS
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 68)
    print("COLLECTING IMAGES")
    print("=" * 68)
    paths, labels = collect(Path(args.root))
    print(f"found {len(paths)} images across {len(set(labels))} classes")

    print("\n" + "=" * 68)
    print("LEAKAGE-FREE GROUPED SPLIT")
    print("=" * 68)
    split = grouped_split(
        paths, labels,
        test_size=args.test_size,
        max_per_class=args.max_per_class or None,
        random_state=args.seed,
    )
    print(split.summary())

    # A source group must never straddle the split. Assert it.
    from agrisense.disease.split import source_group
    tr_groups = {source_group(p) for p in split.train_paths}
    te_groups = {source_group(p) for p in split.test_paths}
    overlap = tr_groups & te_groups
    assert not overlap, f"LEAKAGE: {len(overlap)} source groups on both sides"
    print(f"verified: 0 source groups shared between train and test "
          f"({len(tr_groups)} train / {len(te_groups)} test groups)")

    print("\n" + "=" * 68)
    print(f"EXTRACTING FEATURES (dim={F.feature_dim()}, size={F.IMAGE_SIZE}px)")
    print("=" * 68)
    X_tr, keep_tr = extract_many(split.train_paths, n_jobs=args.n_jobs)
    y_tr = np.array([split.train_labels[i] for i in keep_tr])
    X_te, keep_te = extract_many(split.test_paths, n_jobs=args.n_jobs)
    y_te = np.array([split.test_labels[i] for i in keep_te])

    cache = out_dir / "disease_features.npz"
    np.savez_compressed(cache, X_train=X_tr, y_train=y_tr, X_test=X_te, y_test=y_te)

    meta = {
        "root": str(args.root),
        "image_size": F.IMAGE_SIZE,
        "feature_dim": int(X_tr.shape[1]),
        "n_train": int(X_tr.shape[0]),
        "n_test": int(X_te.shape[0]),
        "n_classes": int(len(set(y_tr))),
        "n_source_groups": split.n_groups,
        "mean_images_per_group": round(split.grouping_quality, 3),
        "max_per_class": args.max_per_class or None,
        "split_note": (
            "Split by source image group, pooling the dataset's shipped train/ "
            "and valid/ folders. The shipped split leaks: it was augmented "
            "before splitting, so augmented copies of one leaf appear on both "
            "sides. Metrics from this grouped split are the honest ones."
        ),
    }
    (out_dir / "disease_features_meta.json").write_text(json.dumps(meta, indent=2))
    print(f"\n[saved] {cache}")
    print(f"[saved] {out_dir / 'disease_features_meta.json'}")


if __name__ == "__main__":
    main()
