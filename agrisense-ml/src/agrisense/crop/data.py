"""Crop recommendation dataset: load, validate, and honestly describe it.

Source: Kaggle `atharvaingle/crop-recommendation-dataset` (Crop_recommendation.csv)
2200 rows, 22 crops, 100 rows per crop, 7 numeric features, no missing values.

Known provenance limitation, which the model card must repeat: this dataset
was *built* by augmenting Indian rainfall / climate / fertilizer references.
It is not a record of observed planting outcomes. It is a reasonable teaching
signal for "which crop suits these conditions", and it is not evidence that a
given crop will succeed on a given farm.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
TARGET = "label"

# Maps the API's verbose field names (Phase 2 contract) to CSV columns.
API_TO_CSV = {
    "nitrogen": "N",
    "phosphorus": "P",
    "potassium": "K",
    "temperature": "temperature",
    "humidity": "humidity",
    "ph": "ph",
    "rainfall": "rainfall",
}

# Physically plausible ranges. Values outside these are rejected as invalid
# input (a data-entry error), separately from the statistical OOD check.
PLAUSIBLE = {
    "N": (0.0, 300.0),
    "P": (0.0, 300.0),
    "K": (0.0, 300.0),
    "temperature": (-10.0, 60.0),
    "humidity": (0.0, 100.0),
    "ph": (0.0, 14.0),
    "rainfall": (0.0, 5000.0),
}


def load(csv_path: str | Path) -> pd.DataFrame:
    """Load and sanity-check the crop CSV."""
    df = pd.read_csv(csv_path)
    missing = [c for c in FEATURES + [TARGET] if c not in df.columns]
    if missing:
        raise ValueError(
            f"{csv_path} is missing expected columns {missing}. "
            f"Found: {list(df.columns)}"
        )
    df = df[FEATURES + [TARGET]].copy()

    n_before = len(df)
    df = df.dropna()
    if len(df) != n_before:
        print(f"[crop.data] dropped {n_before - len(df)} rows with missing values")

    # Exact duplicate rows would leak across a random split.
    n_before = len(df)
    df = df.drop_duplicates()
    if len(df) != n_before:
        print(f"[crop.data] dropped {n_before - len(df)} exact duplicate rows")

    return df.reset_index(drop=True)


def describe(df: pd.DataFrame) -> str:
    """A short profile printed at the top of training, so nothing is assumed."""
    counts = df[TARGET].value_counts()
    lines = [
        f"rows={len(df)}  classes={df[TARGET].nunique()}",
        f"class balance: min={counts.min()} max={counts.max()} "
        f"(balanced={counts.min() == counts.max()})",
        "feature ranges:",
    ]
    for f in FEATURES:
        lines.append(
            f"  {f:<12} min={df[f].min():>8.2f} max={df[f].max():>8.2f} "
            f"mean={df[f].mean():>8.2f} std={df[f].std():>7.2f}"
        )
    return "\n".join(lines)


def validate_api_input(payload: dict) -> tuple[np.ndarray, list[str]]:
    """Turn a Phase 2 crop-recommendation request into a feature vector.

    Returns (feature_vector, errors). Errors are field-level and human
    readable; the service turns a non-empty list into a validation_error.
    """
    errors: list[str] = []
    values: list[float] = []

    for api_name, csv_name in API_TO_CSV.items():
        raw = payload.get(api_name)
        if raw is None:
            errors.append(f"{api_name} is required")
            values.append(np.nan)
            continue
        try:
            val = float(raw)
        except (TypeError, ValueError):
            errors.append(f"{api_name} must be a number, got {raw!r}")
            values.append(np.nan)
            continue
        lo, hi = PLAUSIBLE[csv_name]
        if not (lo <= val <= hi):
            errors.append(f"{api_name}={val} is outside the plausible range [{lo}, {hi}]")
        values.append(val)

    return np.array(values, dtype=float).reshape(1, -1), errors
