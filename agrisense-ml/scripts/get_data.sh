#!/usr/bin/env bash
# Download instructions for the AgriSense datasets.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data

cat <<'TXT'
================================================================
AgriSense AI - dataset setup
================================================================

OPTION A - Kaggle CLI (recommended)
-----------------------------------
  pip install kaggle
  # Put your kaggle.json in ~/.kaggle/ (Kaggle > Account > Create New API Token)
  chmod 600 ~/.kaggle/kaggle.json

  kaggle datasets download -d atharvaingle/crop-recommendation-dataset -p data --unzip
  kaggle datasets download -d vipoooool/new-plant-diseases-dataset -p data --unzip

OPTION B - browser
------------------
  https://www.kaggle.com/datasets/atharvaingle/crop-recommendation-dataset
  https://www.kaggle.com/datasets/vipoooool/new-plant-diseases-dataset
  Unzip both into ./data

OPTIONAL - PlantDoc, for the field-realism check (scripts/eval_field.py)
-----------------------------------------------------------------------
  git clone https://github.com/pratikkayal/PlantDoc-Dataset data/PlantDoc-Dataset

EXPECTED LAYOUT
---------------
  data/Crop_recommendation.csv
  data/new-plant-diseases-dataset/train/<38 class folders>/*.JPG
  data/new-plant-diseases-dataset/valid/<38 class folders>/*.JPG
  data/PlantDoc-Dataset/test/<class folders>/*.jpg        (optional)

NOTE: the unzipped plant-disease folder is sometimes nested one level deeper
("New Plant Diseases Dataset(Augmented)"). Pass whatever directory actually
contains train/ and valid/ via --root.

REMINDER: the shipped train/valid split LEAKS (augmented before splitting).
This repo pools both folders and re-splits by source image. See ML_PLAN.md 1.2.
TXT

if [ -f data/Crop_recommendation.csv ]; then
  echo; echo "[ok] found data/Crop_recommendation.csv"
else
  echo; echo "[missing] data/Crop_recommendation.csv"
fi
for d in data/new-plant-diseases-dataset data/"New Plant Diseases Dataset(Augmented)"; do
  [ -d "$d" ] && echo "[ok] found $d"
done
