"""Confidence routing: turn a model score into one of four honest states.

This module is the reason AgriSense is not just another classifier demo.
The Phase 1 design says an uncertain score must never be presented as a
diagnosis. Every decision here is explicit and every decision carries a
machine-readable `reason` so the backend and the UI can say *why* a result
was routed, not just where it went.

The four states come from Phase 3's confidence state machine:

    HIGH_CONFIDENCE            -> present as a likely result, with context
    REVIEW_REQUIRED            -> community review queue
    ADDITIONAL_INPUT_REQUIRED  -> ask the farmer for better evidence
    EXPERT_REQUIRED            -> escalate to an agricultural officer
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any

HIGH_CONFIDENCE = "HIGH_CONFIDENCE"
REVIEW_REQUIRED = "REVIEW_REQUIRED"
ADDITIONAL_INPUT_REQUIRED = "ADDITIONAL_INPUT_REQUIRED"
EXPERT_REQUIRED = "EXPERT_REQUIRED"

# Farmer-facing copy. Deliberately hedged: the UI shows these verbatim.
MESSAGES = {
    HIGH_CONFIDENCE: "Likely result. Confirm against local conditions before acting.",
    REVIEW_REQUIRED: "Under verification. This result is not confirmed yet.",
    ADDITIONAL_INPUT_REQUIRED: "We need clearer input before we can analyse this.",
    EXPERT_REQUIRED: "Please consult an agricultural officer before taking action.",
}


@dataclass
class RoutingDecision:
    status: str
    reason: str
    message: str
    confidence: float
    margin: float
    details: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def route(
    *,
    top1_prob: float,
    top2_prob: float,
    thresholds: dict[str, Any],
    quality_failures: list[str] | None = None,
    is_out_of_distribution: bool = False,
    is_high_risk: bool = False,
    details: dict[str, Any] | None = None,
) -> RoutingDecision:
    """Map one prediction to a routing state.

    Order matters, and it is deliberately evidence-first: we refuse to score
    input we cannot trust before we ever look at the model's confidence. A
    confident prediction on a blurry photo is worse than no prediction.
    """
    quality_failures = quality_failures or []
    details = dict(details or {})
    margin = float(top1_prob) - float(top2_prob)

    def decide(status: str, reason: str) -> RoutingDecision:
        return RoutingDecision(
            status=status,
            reason=reason,
            message=MESSAGES[status],
            confidence=round(float(top1_prob), 4),
            margin=round(margin, 4),
            details=details,
        )

    # 1. Bad evidence. Do not run the model's opinion past the farmer.
    if quality_failures:
        details["quality_failures"] = quality_failures
        return decide(ADDITIONAL_INPUT_REQUIRED, "input_quality_insufficient")

    # 2. Input unlike anything the model was trained on. A classifier will
    #    still emit a confident softmax here -- that number is meaningless.
    if is_out_of_distribution:
        return decide(ADDITIONAL_INPUT_REQUIRED, "input_outside_training_distribution")

    high = float(thresholds["high_confidence"])
    high_margin = float(thresholds["high_margin"])
    review_floor = float(thresholds["review_floor"])

    # 3. Too uncertain for a crowd review to resolve -> a human expert.
    if top1_prob < review_floor:
        return decide(EXPERT_REQUIRED, "confidence_below_review_floor")

    # 4. High-impact advice (pesticide / dosage) is never auto-confirmed,
    #    however confident the model is.
    if is_high_risk:
        details["high_risk_class"] = True
        if top1_prob >= high and margin >= high_margin:
            return decide(REVIEW_REQUIRED, "high_risk_class_requires_verification")
        return decide(EXPERT_REQUIRED, "high_risk_class_and_uncertain")

    # 5. Confident AND decisive.
    if top1_prob >= high and margin >= high_margin:
        return decide(HIGH_CONFIDENCE, "confidence_and_margin_met")

    # 6. Confident but torn between two candidates.
    if top1_prob >= high:
        return decide(REVIEW_REQUIRED, "margin_between_top_two_too_small")

    return decide(REVIEW_REQUIRED, "confidence_below_high_threshold")


def is_high_risk_label(label: str, substrings: list[str]) -> bool:
    """True if a disease label implies a treatment action needing an expert."""
    low = label.lower()
    return any(s.lower() in low for s in substrings)
