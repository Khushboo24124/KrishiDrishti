"""Tests for the confidence routing state machine.

These encode the product's safety promises. If one of these fails, the system
is capable of presenting an uncertain result as a confirmed diagnosis.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from agrisense import routing  # noqa: E402

TH = {"high_confidence": 0.80, "high_margin": 0.20, "review_floor": 0.45}


def test_confident_and_decisive_is_high_confidence():
    d = routing.route(top1_prob=0.95, top2_prob=0.02, thresholds=TH)
    assert d.status == routing.HIGH_CONFIDENCE
    assert d.reason == "confidence_and_margin_met"


def test_confident_but_torn_between_two_goes_to_review():
    """0.82 vs 0.80 is not confidence, it is a coin flip with a high number."""
    d = routing.route(top1_prob=0.82, top2_prob=0.80, thresholds=TH)
    assert d.status == routing.REVIEW_REQUIRED
    assert d.reason == "margin_between_top_two_too_small"


def test_medium_confidence_goes_to_review():
    d = routing.route(top1_prob=0.60, top2_prob=0.10, thresholds=TH)
    assert d.status == routing.REVIEW_REQUIRED


def test_very_low_confidence_escalates_to_expert():
    d = routing.route(top1_prob=0.20, top2_prob=0.18, thresholds=TH)
    assert d.status == routing.EXPERT_REQUIRED
    assert d.reason == "confidence_below_review_floor"


def test_bad_quality_beats_high_confidence():
    """A confident prediction on an unusable photo must never be shown."""
    d = routing.route(top1_prob=0.99, top2_prob=0.001, thresholds=TH,
                      quality_failures=["image_too_blurry"])
    assert d.status == routing.ADDITIONAL_INPUT_REQUIRED
    assert "image_too_blurry" in d.details["quality_failures"]


def test_out_of_distribution_beats_high_confidence():
    d = routing.route(top1_prob=0.99, top2_prob=0.001, thresholds=TH,
                      is_out_of_distribution=True)
    assert d.status == routing.ADDITIONAL_INPUT_REQUIRED
    assert d.reason == "input_outside_training_distribution"


def test_high_risk_class_never_auto_confirms():
    """Pesticide-implying advice is never returned as HIGH_CONFIDENCE."""
    d = routing.route(top1_prob=0.99, top2_prob=0.001, thresholds=TH, is_high_risk=True)
    assert d.status == routing.REVIEW_REQUIRED
    assert d.details["high_risk_class"] is True


def test_high_risk_and_uncertain_escalates():
    d = routing.route(top1_prob=0.60, top2_prob=0.30, thresholds=TH, is_high_risk=True)
    assert d.status == routing.EXPERT_REQUIRED


def test_quality_failure_takes_precedence_over_ood():
    d = routing.route(top1_prob=0.9, top2_prob=0.01, thresholds=TH,
                      quality_failures=["no_clear_leaf_detected"],
                      is_out_of_distribution=True)
    assert d.reason == "input_quality_insufficient"


def test_every_status_has_farmer_facing_copy():
    for status in (routing.HIGH_CONFIDENCE, routing.REVIEW_REQUIRED,
                   routing.ADDITIONAL_INPUT_REQUIRED, routing.EXPERT_REQUIRED):
        assert routing.MESSAGES[status]


@pytest.mark.parametrize("label,expected", [
    ("Tomato___Late_blight", True),
    ("Potato___Early_blight", True),
    ("Orange___Haunglongbing_(Citrus_greening)", True),
    ("Tomato___Tomato_mosaic_virus", True),
    ("Apple___healthy", False),
    ("Blueberry___healthy", False),
])
def test_high_risk_label_detection(label, expected):
    subs = ["blight", "rot", "virus", "mold", "mildew", "bacterial", "Haunglongbing"]
    assert routing.is_high_risk_label(label, subs) is expected


def test_margin_is_reported():
    d = routing.route(top1_prob=0.9, top2_prob=0.4, thresholds=TH)
    assert d.margin == pytest.approx(0.5)
