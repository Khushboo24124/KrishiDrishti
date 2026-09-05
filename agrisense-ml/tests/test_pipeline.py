"""Tests for feature extraction, quality gating and the grouped split."""
import sys
from pathlib import Path

import numpy as np
import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from agrisense.disease import features as F  # noqa: E402
from agrisense.disease import quality  # noqa: E402
from agrisense.disease.split import cap_by_group, grouped_split, source_group  # noqa: E402

CFG = yaml.safe_load(
    (Path(__file__).resolve().parents[1] / "configs" / "routing.yaml").read_text()
)


def green_leaf(seed=0):
    rng = np.random.default_rng(seed)
    img = np.zeros((128, 128, 3), np.float32)
    img[..., 0], img[..., 1], img[..., 2] = 0.20, 0.55, 0.15
    img += rng.normal(0, 0.05, img.shape).astype(np.float32)
    img[::4, :, :] *= 0.8
    return np.clip(img, 0, 1)


# ---------------- features ----------------

def test_feature_vector_is_finite_and_fixed_length():
    v = F.extract(green_leaf())
    assert v.shape == (F.feature_dim(),)
    assert np.isfinite(v).all()


@pytest.mark.parametrize("img", [
    np.zeros((128, 128, 3), np.float32),
    np.ones((128, 128, 3), np.float32),
    np.random.default_rng(0).random((128, 128, 3)).astype(np.float32),
])
def test_degenerate_images_do_not_crash_or_produce_nan(img):
    v = F.extract(img)
    assert np.isfinite(v).all()


def test_features_are_invariant_to_rotation_and_flip():
    """The dataset's augmentations are rotations and flips. Our descriptor is
    invariant to them, which is why augmented copies carry no new information
    and why they must not be allowed to straddle a train/test split."""
    leaf = green_leaf()
    base = F.extract(leaf)
    assert np.allclose(base, F.extract(np.rot90(leaf).copy()), atol=1e-5)
    assert np.allclose(base, F.extract(leaf[::-1].copy()), atol=1e-5)


def test_features_separate_healthy_from_diseased():
    rng = np.random.default_rng(1)
    leaf = green_leaf()
    sick = leaf.copy()
    n = int(128 * 128 * 0.25)
    ys, xs = rng.integers(0, 128, n), rng.integers(0, 128, n)
    for c, v in enumerate((0.35, 0.22, 0.08)):
        sick[ys, xs, c] = v
    assert np.linalg.norm(F.extract(leaf) - F.extract(sick)) > 1.0


# ---------------- quality gate ----------------

def test_good_leaf_passes_quality_gate():
    assert quality.assess(green_leaf(), CFG["disease"]["quality"]).passed


@pytest.mark.parametrize("name,img", [
    ("grey wall", np.full((128, 128, 3), 0.5, np.float32)),
    ("brown soil", np.dstack([np.full((128, 128), v, np.float32) for v in (.45, .32, .18)])),
    ("blue sky", np.dstack([np.full((128, 128), v, np.float32) for v in (.35, .55, .85)])),
])
def test_non_leaf_images_are_rejected(name, img):
    """The single most dangerous input is a confident diagnosis of a non-leaf."""
    r = quality.assess(img, CFG["disease"]["quality"])
    assert not r.passed, f"{name} wrongly passed the leaf check"
    assert "no_clear_leaf_detected" in r.failures


def test_blurry_image_is_rejected():
    img = green_leaf()
    for _ in range(6):
        img = (np.roll(img, 1, 0) + np.roll(img, -1, 0) +
               np.roll(img, 1, 1) + np.roll(img, -1, 1) + img) / 5
    r = quality.assess(img, CFG["disease"]["quality"])
    assert not r.passed and "image_too_blurry" in r.failures


def test_dark_and_overexposed_are_rejected():
    assert "image_too_dark" in quality.assess(
        green_leaf() * 0.06, CFG["disease"]["quality"]).failures
    assert "image_overexposed" in quality.assess(
        np.clip(green_leaf() * 3 + 0.75, 0, 1), CFG["disease"]["quality"]).failures


def test_every_failure_code_has_farmer_guidance():
    for code in ("image_too_blurry", "no_clear_leaf_detected",
                 "image_too_dark", "image_overexposed"):
        assert code in quality.GUIDANCE


# ---------------- grouped split ----------------

UID = "0a5e9323-dbad-432d-ac58-d291718345d9"


def test_augmentations_share_a_source_group():
    names = [f"{UID}___FREC_Scab 3417{suf}.JPG"
             for suf in ("", "_90deg", "_180deg", "_flipTB", "_newGRR", "_newPixel25")]
    assert len({source_group(Path(n)) for n in names}) == 1


def test_different_source_images_get_different_groups():
    a = source_group(Path(f"{UID}___FREC_Scab 1.JPG"))
    b = source_group(Path("1b1cf3e0-1111-2222-3333-444455556666___FREC_Scab 2.JPG"))
    assert a != b


def test_fallback_grouping_without_uuid():
    assert source_group(Path("odd_name_90deg.JPG")) == source_group(Path("odd_name.JPG"))


def _fake_dataset(n_source=20, n_aug=4, classes=("A", "B")):
    paths, labels = [], []
    for ci, c in enumerate(classes):
        for i in range(n_source):
            uid = f"{ci:02d}{i:034d}"
            for a in range(n_aug):
                suf = "" if a == 0 else f"_{a * 90}deg"
                paths.append(Path(f"/x/{c}/{uid}___RS 1{suf}.JPG"))
                labels.append(c)
    return paths, labels


def test_grouped_split_never_straddles_a_source_group():
    paths, labels = _fake_dataset()
    s = grouped_split(paths, labels, test_size=0.25, random_state=0)
    tr = {source_group(p) for p in s.train_paths}
    te = {source_group(p) for p in s.test_paths}
    assert tr and te
    assert not (tr & te), "source group leaked across the split"


def test_capping_keeps_groups_whole():
    paths, labels = _fake_dataset(n_source=20, n_aug=4)
    capped_paths, capped_labels = cap_by_group(paths, labels, max_per_class=8, random_state=0)
    from collections import Counter
    per_group = Counter(source_group(p) for p in capped_paths)
    # Every retained group must keep all 4 of its augmentations.
    assert set(per_group.values()) == {4}
    assert len(set(capped_labels)) == 2
