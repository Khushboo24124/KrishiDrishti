"""Leakage-free splitting for the New Plant Diseases (augmented) dataset.

The problem
-----------
Kaggle `vipoooool/new-plant-diseases-dataset` ships ~87.9k images in 38
classes, pre-split into train/ (70,295) and valid/ (17,572). But the
augmentation was applied to the whole PlantVillage pool *before* that split.
So a leaf photographed once can appear as the original in train/ and as its
90-degree rotation in valid/. The model has effectively seen the validation
set. Reported accuracy on that split is inflated and cannot be used to set a
confidence threshold.

The fix
-------
PlantVillage filenames keep the source image's UUID before the `___` marker:

    0a5e9323-dbad-432d-ac58-d291718345d9___FREC_Scab 3417.JPG
    0a5e9323-dbad-432d-ac58-d291718345d9___FREC_Scab 3417_90deg.JPG
    ^-------------- same source leaf ---------------^

We pool train/ and valid/, group every file by that source id, and split by
*group*. All augmentations of one leaf land on the same side. The resulting
accuracy is lower and real.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.model_selection import GroupShuffleSplit

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"}

# Augmentation tokens appended by the "augmented" redistribution.
_AUG_TOKEN = re.compile(
    r"(_(?:\d{1,3}deg|flip(?:TB|LR)?|new(?:GRR|Pixel\d*|Sharp\w*)?|"
    r"rot\d*|zoom\d*|shear\d*|bright\d*|sat\d*|blur\d*))+$",
    re.IGNORECASE,
)
_UUIDISH = re.compile(r"^[0-9a-fA-F][0-9a-fA-F-]{7,}$")


def source_group(path: Path) -> str:
    """Return a stable id shared by every augmentation of one source image."""
    stem = path.stem
    # Preferred: the UUID PlantVillage puts before the '___' marker.
    if "___" in stem:
        head = stem.split("___", 1)[0].strip()
        if _UUIDISH.match(head):
            return head
    # Fallback: strip trailing augmentation tokens from the filename.
    return _AUG_TOKEN.sub("", stem).strip()


@dataclass
class SplitResult:
    train_paths: list[Path]
    train_labels: list[str]
    test_paths: list[Path]
    test_labels: list[str]
    n_groups: int
    grouping_quality: float  # mean images per group; ~1.0 means grouping failed

    def summary(self) -> str:
        return (
            f"train={len(self.train_paths)} images  test={len(self.test_paths)} images\n"
            f"source groups={self.n_groups}  mean images/group={self.grouping_quality:.2f}"
        )


def collect(root: Path) -> tuple[list[Path], list[str]]:
    """Walk `root`/<class_name>/*.jpg, pooling train/ and valid/ if present."""
    root = Path(root)
    search_dirs = []
    for candidate in ("train", "valid", "validation", "val"):
        d = root / candidate
        if d.is_dir():
            search_dirs.append(d)
    if not search_dirs:
        search_dirs = [root]

    paths: list[Path] = []
    labels: list[str] = []
    for d in search_dirs:
        for class_dir in sorted(p for p in d.iterdir() if p.is_dir()):
            for img in sorted(class_dir.iterdir()):
                if img.suffix in IMAGE_SUFFIXES:
                    paths.append(img)
                    labels.append(class_dir.name)
    if not paths:
        raise FileNotFoundError(
            f"No images found under {root}. Expected <root>/train/<class>/*.jpg "
            f"or <root>/<class>/*.jpg"
        )
    return paths, labels


def cap_by_group(
    paths: list[Path],
    labels: list[str],
    max_per_class: int,
    random_state: int = 42,
) -> tuple[list[Path], list[str]]:
    """Cap images per class while keeping every source group intact.

    Sampling whole groups (rather than individual files) is what stops
    subsampling from silently reintroducing the leakage we just removed.
    """
    rng = np.random.default_rng(random_state)
    groups = [source_group(p) for p in paths]

    by_class: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    for idx, (lab, grp) in enumerate(zip(labels, groups)):
        by_class[lab][grp].append(idx)

    keep: list[int] = []
    for lab, grp_map in by_class.items():
        grp_ids = sorted(grp_map)
        rng.shuffle(grp_ids)
        taken = 0
        for g in grp_ids:
            if taken >= max_per_class:
                break
            keep.extend(grp_map[g])
            taken += len(grp_map[g])
    keep.sort()
    return [paths[i] for i in keep], [labels[i] for i in keep]


def grouped_split(
    paths: list[Path],
    labels: list[str],
    test_size: float = 0.2,
    max_per_class: int | None = None,
    random_state: int = 42,
) -> SplitResult:
    """Split by source image so no leaf appears on both sides.

    `max_per_class` caps images per class *by group*, keeping whole groups
    together, so subsampling never reintroduces leakage.
    """
    if max_per_class:
        paths, labels = cap_by_group(paths, labels, max_per_class, random_state)
    groups = [source_group(p) for p in paths]

    n_groups = len(set(groups))
    quality = len(paths) / max(n_groups, 1)
    if quality < 1.05:
        print(
            "[split] WARNING: mean images per source group is "
            f"{quality:.2f}. Filenames may not match the expected PlantVillage "
            "pattern, so grouping may not be removing augmentation leakage. "
            "Inspect a few filenames before trusting the reported accuracy."
        )

    splitter = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=random_state)
    train_idx, test_idx = next(splitter.split(paths, labels, groups=groups))

    return SplitResult(
        train_paths=[paths[i] for i in train_idx],
        train_labels=[labels[i] for i in train_idx],
        test_paths=[paths[i] for i in test_idx],
        test_labels=[labels[i] for i in test_idx],
        n_groups=n_groups,
        grouping_quality=quality,
    )
