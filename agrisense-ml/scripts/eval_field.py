"""Evaluate the trained disease model on REAL field photographs.

Why this script decides whether the project is honest
----------------------------------------------------
PlantVillage images are single leaves on a uniform background under even
light. Published results show models trained on that data score ~99% on
their own test split and then fall below 40% on field photographs. A farmer
holding a phone over a plant produces the second kind of image, not the first.

So the accuracy printed by `disease/train.py` is an upper bound for lab-like
uploads. It is NOT a real-world accuracy estimate, and it must never be
presented as one on a slide.

This script measures the real gap using PlantDoc (2,598 field images, 13
species), then reports what the routing layer does with those images. The
target is not high field accuracy -- classical features will not deliver that.
The target is that the system REFUSES rather than guesses: low field accuracy
paired with a low HIGH_CONFIDENCE rate is a correct, safe system. Low field
accuracy with a high HIGH_CONFIDENCE rate is a dangerous one.

Get PlantDoc:  https://github.com/pratikkayal/PlantDoc-Dataset

Usage:
    python scripts/eval_field.py --root data/PlantDoc-Dataset/test
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from agrisense.disease.predict import DiseasePredictor  # noqa: E402
from agrisense.disease.split import collect  # noqa: E402


def normalise(name: str) -> str:
    """Crude label alignment: PlantDoc and PlantVillage name classes differently."""
    return (name.lower().replace("___", " ").replace("_", " ")
            .replace("(", " ").replace(")", " ").replace("  ", " ").strip())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="PlantDoc image root (<root>/<class>/*.jpg)")
    ap.add_argument("--model", default=None)
    ap.add_argument("--limit", type=int, default=0, help="cap images (0 = all)")
    args = ap.parse_args()

    predictor = DiseasePredictor(args.model)
    paths, labels = collect(Path(args.root))
    if args.limit:
        paths, labels = paths[: args.limit], labels[: args.limit]
    print(f"evaluating {len(paths)} field images against {predictor.model_version}\n")

    known = {normalise(c) for c in predictor.classes}
    statuses: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    scored = matched = correct = 0

    for path, truth in zip(paths, labels):
        try:
            res = predictor.predict_bytes(Path(path).read_bytes())
        except ValueError:
            statuses["DECODE_FAILED"] += 1
            continue
        statuses[res["routingStatus"]] += 1
        reasons[res["reason"]] += 1
        if res["disease"] is None:
            continue
        scored += 1
        t = normalise(truth)
        if t not in known:
            continue  # class not in our label space; cannot be scored fairly
        matched += 1
        predicted = normalise(f"{res['crop']} {res['disease']}")
        if predicted == t:
            correct += 1

    n = len(paths)
    print("=" * 62)
    print("ROUTING BEHAVIOUR ON FIELD IMAGES")
    print("=" * 62)
    for status, count in statuses.most_common():
        print(f"  {status:<28} {count:>6}  ({count / n:.1%})")
    print("\n  top reasons:")
    for reason, count in reasons.most_common(6):
        print(f"    {reason:<44} {count:>6}")

    print("\n" + "=" * 62)
    print("ACCURACY ON SCOREABLE FIELD IMAGES")
    print("=" * 62)
    print(f"  images scored by the model      : {scored}")
    print(f"  with a label we can map         : {matched}")
    if matched:
        print(f"  accuracy on those              : {correct / matched:.4f}")
    else:
        print("  accuracy: n/a (no overlapping labels)")

    hc = statuses.get("HIGH_CONFIDENCE", 0)
    print("\n" + "=" * 62)
    print("VERDICT")
    print("=" * 62)
    print(f"  HIGH_CONFIDENCE rate on field images: {hc / n:.1%}")
    print("  A LOW rate here is GOOD. It means the system declines to guess on")
    print("  images unlike its training data, and routes them to a human instead.")
    print("  A high rate paired with low accuracy is the dangerous outcome and")
    print("  means the thresholds in configs/routing.yaml are too permissive.")


if __name__ == "__main__":
    main()
