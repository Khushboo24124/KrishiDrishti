"""Evaluation utilities focused on *trustworthiness*, not just accuracy.

Accuracy alone cannot justify a confidence threshold. These helpers answer
the question the routing layer actually needs answered: "when this model
says 0.9, is it right 90% of the time?"
"""
from __future__ import annotations

import numpy as np


def top1_top2(proba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (top-1 probability, top-2 probability) per row."""
    part = np.sort(proba, axis=1)
    top1 = part[:, -1]
    top2 = part[:, -2] if proba.shape[1] > 1 else np.zeros_like(top1)
    return top1, top2


def expected_calibration_error(
    confidences: np.ndarray, correct: np.ndarray, n_bins: int = 15
) -> float:
    """ECE: average gap between stated confidence and observed accuracy.

    0.0 is perfect. Above ~0.05 means the confidence number is misleading and
    must not be shown to a farmer as-is.
    """
    confidences = np.asarray(confidences, dtype=float)
    correct = np.asarray(correct, dtype=float)
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = len(confidences)
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (confidences > lo) & (confidences <= hi)
        if not mask.any():
            continue
        ece += (mask.sum() / n) * abs(correct[mask].mean() - confidences[mask].mean())
    return float(ece)


def multiclass_brier(proba: np.ndarray, y_true_idx: np.ndarray) -> float:
    """Brier score over the full probability vector. Lower is better."""
    onehot = np.zeros_like(proba)
    onehot[np.arange(len(y_true_idx)), y_true_idx] = 1.0
    return float(np.mean(np.sum((proba - onehot) ** 2, axis=1)))


def reliability_table(
    confidences: np.ndarray, correct: np.ndarray, n_bins: int = 10
) -> list[dict]:
    """Per-bin stated-confidence vs. observed-accuracy, for a report/plot."""
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    rows = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (confidences > lo) & (confidences <= hi)
        if not mask.any():
            continue
        rows.append(
            {
                "bin": f"({lo:.1f}, {hi:.1f}]",
                "n": int(mask.sum()),
                "mean_confidence": round(float(confidences[mask].mean()), 4),
                "observed_accuracy": round(float(correct[mask].mean()), 4),
            }
        )
    return rows


def threshold_sweep(
    proba: np.ndarray,
    y_true_idx: np.ndarray,
    thresholds: tuple[float, ...] = (0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95),
    margins: tuple[float, ...] = (0.0, 0.1, 0.15, 0.2, 0.3),
) -> list[dict]:
    """Coverage vs. selective accuracy for each (confidence, margin) pair.

    This is the table that should *decide* the values in configs/routing.yaml.
    Read it as: "if I auto-confirm at this threshold, I answer X% of cases
    and I am right Y% of the time on the ones I answer."
    """
    top1, top2 = top1_top2(proba)
    pred = proba.argmax(axis=1)
    correct = (pred == y_true_idx)
    margin = top1 - top2
    n = len(y_true_idx)

    rows = []
    for t in thresholds:
        for m in margins:
            keep = (top1 >= t) & (margin >= m)
            k = int(keep.sum())
            rows.append(
                {
                    "confidence_threshold": t,
                    "margin_threshold": m,
                    "coverage": round(k / n, 4),
                    "n_auto_confirmed": k,
                    # Accuracy on the cases we would auto-confirm.
                    "selective_accuracy": round(float(correct[keep].mean()), 4) if k else None,
                    # Accuracy on what we would send to a human. If this is
                    # high, the thresholds are too conservative.
                    "deferred_accuracy": round(float(correct[~keep].mean()), 4) if k < n else None,
                }
            )
    return rows


def format_sweep(rows: list[dict], limit: int | None = None) -> str:
    """Render a sweep as a fixed-width table for the training log."""
    head = f"{'conf':>6} {'margin':>7} {'coverage':>9} {'sel.acc':>9} {'def.acc':>9}"
    lines = [head, "-" * len(head)]
    for r in rows[:limit]:
        sel = "  n/a" if r["selective_accuracy"] is None else f"{r['selective_accuracy']:.4f}"
        def_ = "  n/a" if r["deferred_accuracy"] is None else f"{r['deferred_accuracy']:.4f}"
        lines.append(
            f"{r['confidence_threshold']:>6.2f} {r['margin_threshold']:>7.2f} "
            f"{r['coverage']:>9.4f} {sel:>9} {def_:>9}"
        )
    return "\n".join(lines)
