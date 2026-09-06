"""Inference wrapper for the crop model, returning a routed decision."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np

from agrisense import routing
from agrisense.config import ARTIFACTS, routing_config
from agrisense.crop import data as cropdata


class CropPredictor:
    """Loads the crop bundle once and answers routed prediction requests."""

    def __init__(self, model_path: str | Path | None = None):
        path = Path(model_path) if model_path else ARTIFACTS / "crop_model.joblib"
        if not path.exists():
            raise FileNotFoundError(
                f"Crop model artifact not found at {path}. "
                f"Run: python -m agrisense.crop.train --csv data/Crop_recommendation.csv"
            )
        bundle = joblib.load(path)
        self.estimator = bundle["estimator"]
        self.novelty = bundle["novelty"]
        self.classes = list(bundle["classes"])
        self.features = bundle["features"]
        self.model_version = bundle["model_version"]

    def predict(self, payload: dict) -> dict[str, Any]:
        """Validate, score, gate and route one crop recommendation request."""
        X, errors = cropdata.validate_api_input(payload)
        if errors:
            return {"error": "validation_error", "details": errors}

        proba = self.estimator.predict_proba(X)[0]
        order = np.argsort(proba)[::-1]
        top1_prob = float(proba[order[0]])
        top2_prob = float(proba[order[1]]) if len(order) > 1 else 0.0
        label = self.classes[order[0]]

        novelty_score = float(self.novelty.score(X)[0])
        is_ood = bool(novelty_score < self.novelty.threshold)

        cfg = routing_config()["crop"]
        decision = routing.route(
            top1_prob=top1_prob,
            top2_prob=top2_prob,
            thresholds=cfg,
            is_out_of_distribution=is_ood,
            details={
                "novelty_score": round(novelty_score, 4),
                "novelty_threshold": round(float(self.novelty.threshold), 4),
                "top_3": [
                    {"crop": self.classes[i], "probability": round(float(proba[i]), 4)}
                    for i in order[:3]
                ],
            },
        )

        return {
            "recommendedCrop": label if decision.status != routing.ADDITIONAL_INPUT_REQUIRED else None,
            "confidence": decision.confidence,
            "margin": decision.margin,
            "modelVersion": self.model_version,
            "routingStatus": decision.status,
            "reason": decision.reason,
            "message": decision.message,
            "evidence": decision.details,
        }
