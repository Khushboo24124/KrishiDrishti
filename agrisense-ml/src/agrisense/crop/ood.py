"""Novelty detection for crop-recommendation inputs.

Why this exists
---------------
The crop dataset is synthetic and its 22 classes occupy tight, well-separated
clusters in 7-D space. A tree ensemble trained on it will return a confident
probability for *any* input, including soil values that look nothing like the
training data -- because trees partition all of space and every leaf has a
label. A farmer entering real Soil Health Card numbers can easily land far
outside that manifold and receive a 0.95-confidence recommendation that means
nothing.

So confidence alone is not a sufficient guard. We fit a density/novelty model
on the training features and refuse to score inputs that fall outside it,
routing them to ADDITIONAL_INPUT_REQUIRED instead.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


@dataclass
class NoveltyDetector:
    """IsolationForest novelty gate with a percentile-calibrated cutoff."""

    scaler: StandardScaler
    forest: IsolationForest
    threshold: float
    percentile: float

    @classmethod
    def fit(
        cls, X: np.ndarray, percentile: float = 1.0, random_state: int = 42
    ) -> "NoveltyDetector":
        """Fit on training features.

        `percentile` is the share of *training* data we are willing to call
        novel. 1.0 means the cutoff sits at the 1st percentile of training
        scores, so ~1% of in-distribution points are flagged -- a deliberately
        permissive gate that only catches genuinely unusual input.
        """
        scaler = StandardScaler().fit(X)
        Xs = scaler.transform(X)
        forest = IsolationForest(
            n_estimators=300,
            contamination="auto",
            random_state=random_state,
        ).fit(Xs)
        train_scores = forest.score_samples(Xs)
        threshold = float(np.percentile(train_scores, percentile))
        return cls(scaler=scaler, forest=forest, threshold=threshold, percentile=percentile)

    def score(self, X: np.ndarray) -> np.ndarray:
        """Higher = more normal. Compare against `self.threshold`."""
        return self.forest.score_samples(self.scaler.transform(X))

    def is_novel(self, X: np.ndarray) -> np.ndarray:
        """True where the input should NOT be scored by the classifier."""
        return self.score(X) < self.threshold
