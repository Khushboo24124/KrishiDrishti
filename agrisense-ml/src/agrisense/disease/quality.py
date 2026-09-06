"""Pre-classification image quality gate.

Phase 1 requires an ADDITIONAL_INPUT_REQUIRED path for "insufficient or
poor-quality image". A classifier cannot produce that state on its own -- it
will happily assign 0.9 probability to a photo of a shoe. These checks run
BEFORE the model and are the only thing standing between a bad upload and a
confident-looking wrong diagnosis.

Every check returns a measurement as well as a verdict, so the reviewer
dashboard can tell the farmer *why* a photo was rejected instead of just
refusing it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from skimage.color import rgb2gray, rgb2hsv

# 3x3 discrete Laplacian. Convolving and taking the variance is the standard
# cheap focus measure: a sharp image has strong second derivatives, a blurred
# one does not.
_LAPLACIAN = np.array([[0.0, 1.0, 0.0],
                       [1.0, -4.0, 1.0],
                       [0.0, 1.0, 0.0]], dtype=np.float64)


def _convolve2d_valid(img: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    """Small 'valid' 2-D convolution using stride tricks (no SciPy needed)."""
    kh, kw = kernel.shape
    h, w = img.shape
    if h < kh or w < kw:
        return np.zeros((1, 1), dtype=np.float64)
    shape = (h - kh + 1, w - kw + 1, kh, kw)
    strides = img.strides * 2
    windows = np.lib.stride_tricks.as_strided(img, shape=shape, strides=strides)
    return np.einsum("ijkl,kl->ij", windows, kernel)


def laplacian_variance(gray: np.ndarray) -> float:
    """Focus measure. Higher = sharper. Expects grayscale in [0, 1]."""
    return float(_convolve2d_valid(gray.astype(np.float64) * 255.0, _LAPLACIAN).var())


def vegetation_fraction(rgb: np.ndarray) -> float:
    """Fraction of pixels that are plausibly living plant tissue.

    Deliberately stricter than the segmentation used for feature extraction.
    `features.leaf_and_lesion_masks` falls back to "anything that is not
    background" so that a severely necrotic leaf still yields a lesion mask --
    but that fallback would let a photo of soil, a hand or a wall through this
    gate. Here we test for green tissue specifically, with no fallback:

      * Excess Green (2g - r - b) on normalised chromaticity, which is
        illumination-tolerant and near zero for any neutral/grey surface.
      * A green hue with real saturation, which rejects washed-out greys that
        happen to carry a slight colour cast.

    A leaf so far gone that under a tenth of it is still green is a case for a
    human, not for this classifier -- so rejecting it here is correct.
    """
    rgb = rgb.astype(np.float32)
    total = rgb.sum(axis=2) + 1e-6
    r, g, b = (rgb[..., i] / total for i in range(3))  # normalised chromaticity
    exg = 2.0 * g - r - b

    hsv = rgb2hsv(rgb)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    green_hue = (hue > 0.17) & (hue < 0.47) & (sat > 0.25) & (val > 0.12)

    return float(((exg > 0.05) & green_hue).mean())


@dataclass
class QualityReport:
    passed: bool
    failures: list[str] = field(default_factory=list)
    measurements: dict[str, Any] = field(default_factory=dict)


def assess(rgb: np.ndarray, cfg: dict[str, Any]) -> QualityReport:
    """Run every gate against one RGB image in [0, 1]."""
    gray = rgb2gray(rgb)
    luma = float(gray.mean() * 255.0)
    blur = laplacian_variance(gray)
    leaf_fraction = vegetation_fraction(rgb)

    failures: list[str] = []
    if blur < float(cfg["min_blur_variance"]):
        failures.append("image_too_blurry")
    if leaf_fraction < float(cfg["min_leaf_fraction"]):
        failures.append("no_clear_leaf_detected")
    if luma < float(cfg["min_mean_luma"]):
        failures.append("image_too_dark")
    if luma > float(cfg["max_mean_luma"]):
        failures.append("image_overexposed")

    return QualityReport(
        passed=not failures,
        failures=failures,
        measurements={
            "blur_variance": round(blur, 2),
            "leaf_fraction": round(leaf_fraction, 4),
            "mean_luma": round(luma, 2),
        },
    )


# Farmer-facing guidance for each failure, shown by the UI.
GUIDANCE = {
    "image_too_blurry": "The photo is out of focus. Hold the phone steady and tap the leaf to focus.",
    "no_clear_leaf_detected": "We could not find a leaf. Fill the frame with a single leaf.",
    "image_too_dark": "The photo is too dark. Take it in daylight or move into better light.",
    "image_overexposed": "The photo is too bright. Avoid direct glare and harsh backlight.",
}
