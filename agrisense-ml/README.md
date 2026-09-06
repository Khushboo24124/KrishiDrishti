# AgriSense AI — ML service

Crop recommendation + leaf disease analysis with confidence-aware routing.
**Classical machine learning only — no deep learning.**

Implements the AI/ML workstream from the AgriSense SDLC docs. Read
[`ML_PLAN.md`](ML_PLAN.md) first: it explains what is wrong with both source
datasets and why this code is shaped the way it is.

---

## Quick start

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

### Verify the pipeline before downloading anything

A synthetic CSV with the real schema ships in `data/` so you can prove the
crop pipeline runs end to end while the Kaggle downloads are still going:

```bash
PYTHONPATH=src python -m agrisense.crop.train --csv data/SYNTHETIC_Crop_recommendation.csv
```

> `SYNTHETIC_Crop_recommendation.csv` is a **fixture**, not real data. It
> mirrors the real file's schema and cluster structure for smoke-testing.
> Never train a demo model on it.

### Get the real data

```bash
bash scripts/get_data.sh          # prints exact download instructions
```

Expected layout:

```
data/
  Crop_recommendation.csv
  new-plant-diseases-dataset/
    train/<38 class folders>/*.JPG
    valid/<38 class folders>/*.JPG
  PlantDoc-Dataset/              # optional, for the field-realism check
    test/<class folders>/*.jpg
```

### Train

```bash
PYTHONPATH=src python -m agrisense.crop.train --csv data/Crop_recommendation.csv

PYTHONPATH=src python -m agrisense.disease.extract --root data/new-plant-diseases-dataset
PYTHONPATH=src python -m agrisense.disease.train
```

Or run everything: `bash scripts/run_all.sh`

**After each training run, read the printed THRESHOLD SWEEP and set the values
in `configs/routing.yaml`.** The shipped values are placeholders.

### Serve

```bash
PYTHONPATH=src uvicorn agrisense.service.main:app --reload --port 8001
```

Docs at `http://localhost:8001/docs`. Contract in
[`API_CONTRACT.md`](API_CONTRACT.md).

### Test

```bash
python -m pytest tests/ -q          # 35 tests, no dataset needed
```

---

## What each piece does

| Path | Role |
|---|---|
| `src/agrisense/routing.py` | The four-state confidence machine. Evidence-first: refuses bad input before consulting confidence. |
| `src/agrisense/metrics.py` | ECE, Brier, reliability table, coverage/selective-accuracy sweep. |
| `src/agrisense/crop/ood.py` | Novelty gate. Stops the model confidently scoring soil values unlike anything it trained on. |
| `src/agrisense/disease/split.py` | **Leakage-free grouped split.** The dataset's shipped train/valid split leaks; this fixes it. |
| `src/agrisense/disease/features.py` | 242-D colour + texture + lesion descriptor. Replaces the CNN. |
| `src/agrisense/disease/quality.py` | Blur / vegetation / exposure gate, run *before* the classifier. |
| `scripts/prove_leakage.py` | Measures how much accuracy the leakage was manufacturing. |
| `scripts/eval_field.py` | Evaluates on real field photos (PlantDoc). The honesty check. |

---

## Model card — read before quoting any number

- **Crop data is synthetic.** Built by augmenting Indian rainfall, climate and
  fertilizer references; it is not observed planting outcomes. The model
  reproduces the dataset's logic, not agronomic truth.
- **Disease data is laboratory imagery.** Single leaves, uniform backgrounds,
  even light. Models trained on it are documented to fall below 40% on real
  field photographs. The training accuracy is an upper bound for lab-like
  uploads, **not** a real-world estimate.
- **Never quote accuracy from the dataset's shipped train/valid split.** It
  leaks. Use the grouped split this repo builds.
- **This system does not diagnose.** It returns a possible identification with
  a routing state. Pesticide- and dosage-implying classes never auto-confirm.

---

## Handoff to the rest of the team

- **Payal (backend):** proxy to `POST /api/v1/ai/recommend/crop` and
  `POST /api/v1/ai/analyze/disease`. This service deliberately does **not**
  mint `predictionId` — Phase 3 assigns that to the backend. Pass
  `routingStatus` and `reason` straight through and persist `evidence`.
- **Shubham (frontend):** `routingStatus` drives the UI state and `reason`
  explains it. `evidence.guidance` carries farmer-facing text for rejected
  photos. `evidence.top_3` is there if you want to show alternatives.
- `GET /api/v1/health` returns `degraded` with per-model errors when an
  artifact is missing, so a broken model is visible instead of silent.
