"""Inference wrapper for the disease model: quality gate -> model -> routing."""
from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from PIL import Image

from agrisense import routing
from agrisense.config import ARTIFACTS, routing_config
from agrisense.disease import features as F
from agrisense.disease import quality

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class DiseasePredictor:
    def __init__(self, model_path: str | Path | None = None):
        path = Path(model_path) if model_path else ARTIFACTS / "disease_model.joblib"
        if not path.exists():
            raise FileNotFoundError(
                f"Disease model artifact not found at {path}. Run:\n"
                f"  python -m agrisense.disease.extract --root data/new-plant-diseases-dataset\n"
                f"  python -m agrisense.disease.train"
            )
        bundle = joblib.load(path)
        self.estimator = bundle["estimator"]
        self.classes = list(bundle["classes"])
        self.model_version = bundle["model_version"]
        self.image_size = int(bundle.get("image_size", F.IMAGE_SIZE))

    @staticmethod
    def decode(raw: bytes, size: int) -> np.ndarray:
        """Decode an upload safely. Never trust the client's content-type."""
        if len(raw) > MAX_UPLOAD_BYTES:
            raise ValueError(f"image exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit")
        try:
            with Image.open(io.BytesIO(raw)) as im:
                fmt = (im.format or "").upper()
                if fmt not in ALLOWED_FORMATS:
                    raise ValueError(f"unsupported image format {fmt or 'unknown'}")
                im = im.convert("RGB").resize((size, size), Image.BILINEAR)
                return np.asarray(im, dtype=np.float32) / 255.0
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"could not decode image: {type(exc).__name__}") from exc

    def predict_array(self, rgb: np.ndarray) -> dict[str, Any]:
        cfg = routing_config()["disease"]

        # 1. Quality gate runs BEFORE the model. A confident prediction on an
        #    unusable photo is the failure mode this whole product exists to avoid.
        qr = quality.assess(rgb, cfg["quality"])
        if not qr.passed:
            decision = routing.route(
                top1_prob=0.0, top2_prob=0.0, thresholds=cfg,
                quality_failures=qr.failures,
                details={
                    "quality": qr.measurements,
                    "guidance": [quality.GUIDANCE[f] for f in qr.failures
                                 if f in quality.GUIDANCE],
                },
            )
            return {
                "disease": None, "crop": None,
                "confidence": 0.0, "margin": 0.0,
                "modelVersion": self.model_version,
                "routingStatus": decision.status,
                "reason": decision.reason,
                "message": decision.message,
                "evidence": decision.details,
            }

        # 2. Score.
        vec = F.extract(rgb).reshape(1, -1)
        proba = self.estimator.predict_proba(vec)[0]
        order = np.argsort(proba)[::-1]
        label = self.classes[order[0]]
        top1 = float(proba[order[0]])
        top2 = float(proba[order[1]]) if len(order) > 1 else 0.0

        crop, disease = self.split_label(label)
        high_risk = routing.is_high_risk_label(label, cfg["high_risk_substring"])

        decision = routing.route(
            top1_prob=top1, top2_prob=top2, thresholds=cfg,
            is_high_risk=high_risk,
            details={
                "quality": qr.measurements,
                "top_3": [
                    {"label": self.classes[i], "probability": round(float(proba[i]), 4)}
                    for i in order[:3]
                ],
            },
        )
        return {
            "disease": disease, "crop": crop,
            "confidence": decision.confidence, "margin": decision.margin,
            "modelVersion": self.model_version,
            "routingStatus": decision.status,
            "reason": decision.reason,
            "message": decision.message,
            "evidence": decision.details,
        }

    def predict_bytes(self, raw: bytes) -> dict[str, Any]:
        return self.predict_array(self.decode(raw, self.image_size))

    @staticmethod
    def split_label(label: str) -> tuple[str, str]:
        """PlantVillage labels look like 'Tomato___Late_blight'."""
        if "___" in label:
            crop, disease = label.split("___", 1)
        else:
            crop, disease = label, label
        return crop.replace("_", " ").strip(), disease.replace("_", " ").strip()
