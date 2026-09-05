#!/usr/bin/env bash
# Train both models end to end.
#   bash scripts/run_all.sh            # real data
#   bash scripts/run_all.sh --smoke    # synthetic fixture, no download needed
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=src

# Prefer the venv's `python`, fall back to python3.
PY="$(command -v python || command -v python3)"
if [ -z "$PY" ]; then echo "no python interpreter found" >&2; exit 1; fi

if [ "${1:-}" = "--smoke" ]; then
  echo "### SMOKE RUN (synthetic fixture - do not ship a model from this)"
  "$PY" -m agrisense.crop.train --csv data/SYNTHETIC_Crop_recommendation.csv
  echo; echo "Smoke run complete. The pipeline works. Now get the real data:"
  echo "  bash scripts/get_data.sh"
  exit 0
fi

CROP_CSV="${CROP_CSV:-data/Crop_recommendation.csv}"
DISEASE_ROOT="${DISEASE_ROOT:-data/new-plant-diseases-dataset}"
MAX_PER_CLASS="${MAX_PER_CLASS:-0}"   # 0 = use every image

echo "### 1/3  crop model"
"$PY" -m agrisense.crop.train --csv "$CROP_CSV"

echo; echo "### 2/3  disease features  (root=$DISEASE_ROOT)"
"$PY" -m agrisense.disease.extract --root "$DISEASE_ROOT" --max-per-class "$MAX_PER_CLASS"

echo; echo "### 3/3  disease model"
"$PY" -m agrisense.disease.train

cat <<'TXT'

================================================================
DONE. Two things before you demo:

 1. Read the THRESHOLD SWEEP printed by each training run and set the
    values in configs/routing.yaml. The shipped ones are placeholders.

 2. Measure what the leakage was worth, and how the model behaves on
    real field photos:
       python scripts/prove_leakage.py --root data/new-plant-diseases-dataset
       python scripts/eval_field.py   --root data/PlantDoc-Dataset/test

Then start the service:
   PYTHONPATH=src uvicorn agrisense.service.main:app --port 8001
================================================================
TXT
