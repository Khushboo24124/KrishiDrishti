"""Configuration loading for AgriSense AI."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = Path(os.environ.get("AGRISENSE_ARTIFACTS", ROOT / "artifacts"))
DATA = Path(os.environ.get("AGRISENSE_DATA", ROOT / "data"))
CONFIG_PATH = Path(os.environ.get("AGRISENSE_CONFIG", ROOT / "configs" / "routing.yaml"))

MODEL_VERSION = os.environ.get("AGRISENSE_MODEL_VERSION", "0.1.0")


@lru_cache(maxsize=1)
def routing_config() -> dict[str, Any]:
    """Load routing thresholds. Cached; call .cache_clear() after editing."""
    with open(CONFIG_PATH) as fh:
        return yaml.safe_load(fh)
