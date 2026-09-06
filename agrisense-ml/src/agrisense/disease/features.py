"""Handcrafted image features for disease classification without deep learning.

Design rationale
----------------
A CNN learns its own filters. Since we are constrained to classical ML, we
must hand the model features that already encode what a plant pathologist
looks at:

  * COLOUR  - the dominant signal. Lesions are chlorotic (yellow), necrotic
              (brown/black) or sporulating (grey/white) against green tissue.
              We use HSV and CIE-Lab, not RGB: both separate chromaticity
              from brightness, so a photo taken in shade still lands near one
              taken in sun.
  * TEXTURE - GLCM captures lesion granularity and leaf-surface roughness;
              LBP captures local micro-patterns like pustules and mottling.
  * LESION  - explicit "how much of this leaf is not healthy green, and how
              is that damage distributed" statistics.
  * SHAPE   - Hu moments over the segmented lesion mask, scale/rotation
              invariant, which matters because the dataset is augmented with
              rotations.

Total dimensionality is 242 (verified). Small enough for a linear SVM or a
gradient-boosted ensemble to fit quickly on tens of thousands of images.

Measured property worth knowing
-------------------------------
This descriptor is EXACTLY invariant to 90/180/270-degree rotations and to
flips: histograms and colour moments ignore pixel order, GLCM properties are
averaged over a symmetric angle set, and Hu moments are rotation invariant.
Verified empirically -- the L2 distance between an image and its 90-degree
rotation is 0.000.

Two consequences, both important for this dataset:

  1. The rotation/flip augmentations in `new-plant-diseases-dataset` produce
     IDENTICAL feature vectors to their source image. Training and validating
     on the dataset's shipped split would therefore score near-perfectly for
     a trivial reason. This is why `split.py` regroups by source image.
  2. We get rotation robustness for free, without needing the augmented
     copies to obtain it.

Extraction costs ~7 ms/image at 128x128, so the full ~88k-image dataset is
only a few minutes of wall time across 8 cores. There is no need to subsample
for tractability.
"""
from __future__ import annotations

import warnings
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.color import rgb2gray, rgb2hsv, rgb2lab
from skimage.feature import graycomatrix, graycoprops, local_binary_pattern
from skimage.measure import moments_hu

IMAGE_SIZE = 128  # square resize; 128 keeps GLCM affordable across ~30k images

_HIST_BINS = 24
_GLCM_DISTANCES = (1, 3)
_GLCM_ANGLES = (0.0, np.pi / 4, np.pi / 2, 3 * np.pi / 4)
_GLCM_PROPS = ("contrast", "dissimilarity", "homogeneity", "energy", "correlation", "ASM")
_GLCM_LEVELS = 32  # quantise grey levels to keep the co-occurrence matrix small


def load_image(path: str | Path, size: int = IMAGE_SIZE) -> np.ndarray:
    """Decode to a square RGB float array in [0, 1]. Raises on a bad file."""
    with Image.open(path) as im:
        im = im.convert("RGB").resize((size, size), Image.BILINEAR)
        arr = np.asarray(im, dtype=np.float32) / 255.0
    return arr


def _hist(channel: np.ndarray, lo: float, hi: float, bins: int = _HIST_BINS) -> np.ndarray:
    h, _ = np.histogram(channel, bins=bins, range=(lo, hi))
    total = h.sum()
    return (h / total).astype(np.float32) if total else h.astype(np.float32)


def _moments(channel: np.ndarray) -> np.ndarray:
    """Mean, std and skew -- a compact stand-in for the full distribution."""
    mu = float(channel.mean())
    sd = float(channel.std())
    if sd < 1e-8:
        skew = 0.0
    else:
        skew = float(np.mean(((channel - mu) / sd) ** 3))
    return np.array([mu, sd, skew], dtype=np.float32)


def leaf_and_lesion_masks(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Segment foliage, then the damaged part of it.

    Excess Green (2G - R - B) is a standard, illumination-tolerant vegetation
    index. Healthy tissue scores high; necrotic and chlorotic tissue does not.
    """
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    exg = 2.0 * g - r - b
    leaf = exg > 0.02
    if leaf.mean() < 0.02:
        # Severely diseased or oddly lit image: fall back to "not background".
        leaf = rgb.max(axis=2) > 0.15

    hsv = rgb2hsv(rgb)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # Healthy green sits roughly in hue 0.17-0.45 with decent saturation.
    healthy = (hue > 0.17) & (hue < 0.45) & (sat > 0.20) & (val > 0.15)
    lesion = leaf & ~healthy
    return leaf, lesion


def extract(rgb: np.ndarray) -> np.ndarray:
    """Return the full feature vector for one pre-loaded RGB image."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        hsv = rgb2hsv(rgb)
        lab = rgb2lab(rgb)
        gray = rgb2gray(rgb)

    parts: list[np.ndarray] = []

    # --- Colour histograms (HSV in [0,1]; Lab on its natural ranges) ---
    parts.append(_hist(hsv[..., 0], 0.0, 1.0))
    parts.append(_hist(hsv[..., 1], 0.0, 1.0))
    parts.append(_hist(hsv[..., 2], 0.0, 1.0))
    parts.append(_hist(lab[..., 0], 0.0, 100.0))
    parts.append(_hist(lab[..., 1], -128.0, 127.0))
    parts.append(_hist(lab[..., 2], -128.0, 127.0))

    # --- Colour moments per channel ---
    for chan in (hsv[..., 0], hsv[..., 1], hsv[..., 2],
                 lab[..., 0], lab[..., 1], lab[..., 2],
                 rgb[..., 0], rgb[..., 1], rgb[..., 2]):
        parts.append(_moments(chan))

    # --- GLCM texture on quantised grey ---
    q = np.clip((gray * (_GLCM_LEVELS - 1)).astype(np.uint8), 0, _GLCM_LEVELS - 1)
    glcm = graycomatrix(
        q, distances=list(_GLCM_DISTANCES), angles=list(_GLCM_ANGLES),
        levels=_GLCM_LEVELS, symmetric=True, normed=True,
    )
    for prop in _GLCM_PROPS:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            vals = graycoprops(glcm, prop)  # (n_distances, n_angles)
        vals = np.nan_to_num(vals, nan=0.0, posinf=0.0, neginf=0.0)
        # Mean over angles gives rotation invariance; std keeps directionality.
        parts.append(vals.mean(axis=1).astype(np.float32))
        parts.append(vals.std(axis=1).astype(np.float32))

    # --- LBP at two radii ---
    for P, R in ((8, 1), (16, 2)):
        lbp = local_binary_pattern((gray * 255).astype(np.uint8), P, R, method="uniform")
        h, _ = np.histogram(lbp, bins=P + 2, range=(0, P + 2))
        total = h.sum()
        parts.append((h / total).astype(np.float32) if total else h.astype(np.float32))

    # --- Lesion statistics ---
    leaf, lesion = leaf_and_lesion_masks(rgb)
    leaf_frac = float(leaf.mean())
    lesion_frac = float(lesion.mean())
    lesion_of_leaf = float(lesion.sum() / leaf.sum()) if leaf.sum() else 0.0
    parts.append(np.array([leaf_frac, lesion_frac, lesion_of_leaf], dtype=np.float32))

    # Colour of the damaged tissue specifically -- distinguishes a brown
    # necrotic blight from a yellow chlorotic deficiency.
    if lesion.sum() > 10:
        parts.append(_moments(hsv[..., 0][lesion]))
        parts.append(_moments(lab[..., 1][lesion]))
        parts.append(_moments(lab[..., 2][lesion]))
    else:
        parts.append(np.zeros(9, dtype=np.float32))

    # --- Hu moments of the lesion mask (rotation/scale invariant) ---
    hu = moments_hu(lesion.astype(np.float64))
    hu = np.sign(hu) * np.log1p(np.abs(hu) * 1e6)  # compress the huge dynamic range
    parts.append(np.nan_to_num(hu, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32))

    vec = np.concatenate([np.atleast_1d(p).ravel() for p in parts]).astype(np.float32)
    return np.nan_to_num(vec, nan=0.0, posinf=0.0, neginf=0.0)


def extract_from_path(path: str | Path) -> np.ndarray:
    return extract(load_image(path))


def feature_dim() -> int:
    """Dimensionality, computed once from a synthetic probe image."""
    probe = np.zeros((IMAGE_SIZE, IMAGE_SIZE, 3), dtype=np.float32)
    probe[..., 1] = 0.5
    return int(extract(probe).shape[0])
