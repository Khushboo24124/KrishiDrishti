# AgriSense AI — ML Plan (classical ML, no deep learning)

Prepared against the four SDLC documents in the parent folder. This covers the
**AI/ML workstream only** (Khushboo's lane in the Phase 4 plan). It does not
touch the Express backend or the frontend; it produces the service they call.

---

## 1. Verdict on the two datasets

**Both are the right choice. Both have a specific defect that will silently
break the project if it is not fixed.** Neither defect is a reason to go
looking for different data — for a two-day hackathon, replacing them costs
more than it returns, and the SDLC docs already commit to PlantVillage.

### 1.1 Crop Recommendation (`atharvaingle/crop-recommendation-dataset`)

2,200 rows · 22 crops · 100 rows each · 7 features · no missing values.

| Property | Reality |
|---|---|
| Provenance | Built by augmenting Indian rainfall, climate and fertilizer references. **Not** observed planting outcomes. |
| Separability | Classes occupy tight, well-separated clusters. Random Forest, Extra Trees, SVM and logistic regression all reach ~99–100%. |
| Coverage | Geographically biased toward India; no soil type, season, irrigation or field history. |

**The defect: it is too easy, and that kills the demo's centrepiece.**

The whole differentiator in Phase 1 is the confidence-aware routing —
`HIGH_CONFIDENCE` / `REVIEW_REQUIRED` / `ADDITIONAL_INPUT_REQUIRED` /
`EXPERT_REQUIRED`. But if every prediction comes back at 0.99, **every case
routes to `HIGH_CONFIDENCE` and the other three states are dead code.** The
judges see a state machine that never changes state.

Verified on a synthetic replica with identical structure — the threshold sweep
returns coverage `1.0000` and selective accuracy `1.0000` at *every*
confidence threshold from 0.50 to 0.90. There is nothing to route.

**The fix — a novelty gate, not a bigger model.** The dataset is synthetic and
tightly clustered, so any real Soil Health Card reading is likely to fall
outside the training manifold. A tree ensemble partitions all of space, so it
returns a confident label for such inputs anyway — a number that means
nothing. `src/agrisense/crop/ood.py` fits an IsolationForest on the training
features and refuses to score inputs outside it. Measured behaviour:

| Input | Result |
|---|---|
| Typical training-like values | `rice`, conf 1.00 → **HIGH_CONFIDENCE** |
| Real arid low-NPK soil card values | *(no crop returned)* → **ADDITIONAL_INPUT_REQUIRED** |
| Saline degraded soil | *(no crop returned)* → **ADDITIONAL_INPUT_REQUIRED** |
| pH = 15 (data entry error) | HTTP 400 `validation_error` |
| Missing field | HTTP 400 `validation_error` |

That is the routing layer doing real work, and it is honest: the model
genuinely does not know about those soils.

### 1.2 New Plant Diseases (`vipoooool/new-plant-diseases-dataset`)

~87,900 images · 38 classes · 14 species · shipped as 70,295 train / 17,572 valid.

**The defect: the shipped train/valid split leaks.** The PlantVillage pool was
*augmented first and split afterwards*, so rotations and flips of the same
source leaf sit on both sides. Validating on it means testing on images the
model already trained on.

This matters more for a classical pipeline than for a CNN. Measured on our
descriptor: **the L2 distance between an image and its 90° rotation is exactly
0.000.** Histograms ignore pixel order, GLCM properties are averaged over a
symmetric angle set, and Hu moments are rotation invariant. So the augmented
copies are not merely similar — they are *identical feature vectors*. Training
and validating across them would be scoring the model on its own training rows.

**The fix — group by source image.** PlantVillage filenames keep the source
UUID before the `___` marker:

```
0a5e9323-…-d291718345d9___FREC_Scab 3417.JPG
0a5e9323-…-d291718345d9___FREC_Scab 3417_90deg.JPG
0a5e9323-…-d291718345d9___FREC_Scab 3417_flipTB.JPG
^──────────── one source leaf ────────────^
```

`src/agrisense/disease/split.py` pools `train/` and `valid/`, groups by that
id, and splits by group with `GroupShuffleSplit`. Extraction asserts zero
straddling groups before training starts.

`scripts/prove_leakage.py` measures the damage on the real data — run it once
and put the number on a slide. On a synthetic replica with the same structure:

```
A) naive random split   accuracy = 0.8917
B) grouped split        accuracy = 0.8667
   inflation from leakage       = +2.50 points
   in arm A, 98.3% of test images had an augmented sibling in train
```

The 98.3% is the structural finding and is a property of the dataset, not of
the model. The accuracy gap on the real 38-class data will differ — measure
it, do not quote this number.

### 1.3 Did I look for better data?

Yes. Nothing displaces either dataset for a two-day build:

- **Crop** — ICRISAT district data, data.gov.in production statistics and Soil
  Health Card releases are all real, but none is a drop-in 7-feature →
  crop-label table. Adopting one means re-scoping the feature contract in
  Phase 2, which breaks Payal's and Shubham's work. Not worth it.
- **Disease** — **PlantDoc** (2,598 field images, 13 species) is worth adding,
  but **as a test set, never for training**. See §4.

---

## 2. Is classical ML actually viable here?

Yes for the crop model — trivially; it is tabular data and a Random Forest is
the textbook answer.

For images it needs justification. Published work using colour + GLCM + LBP
descriptors with an SVM reports ~94% on PlantVillage subsets. Our own
descriptor separates healthy from chlorotic from necrotic tissue cleanly in
feature space. On the full 38 classes with a leakage-free split, **expect
roughly 85–92%** — lower than the ~99% a fine-tuned MobileNetV2 reaches, and
the plan should say so out loud rather than hide it.

**The honest framing, which is also the strongest one:** the ceiling that
matters is not the lab number. Models trained on PlantVillage — CNNs included
— fall **below 40% on real field photographs**, because PlantVillage is single
leaves on uniform backgrounds under even light, and a farmer's phone produces
nothing like that. A deep model would buy a better lab number and would *not*
fix the field gap.

So the defensible position is: a classical model whose confidence is
calibrated and which **declines to answer** when the evidence is weak beats a
deep model that guesses confidently on inputs it cannot handle. That is
exactly the thesis in Phase 1 §7. Classical ML is a coherent choice here, not
a compromise — provided the abstention layer is real, which is the majority of
what this codebase implements.

---

## 3. Architecture

```
                    POST /api/v1/ai/recommend/crop
                                 │
                   validate ─────┤ plausible ranges, required fields
                                 │        └─► 400 validation_error
                    novelty gate ┤ IsolationForest on training manifold
                                 │        └─► ADDITIONAL_INPUT_REQUIRED
                     classifier  ┤ calibrated Extra Trees / Random Forest
                                 ▼
                        routing layer ──► one of four states


                    POST /api/v1/ai/analyze/disease
                                 │
                        decode   ┤ format allowlist, 8 MB cap, safe decode
                                 │        └─► 400 upload_invalid
                   quality gate  ┤ blur · vegetation · exposure   ◄── BEFORE the model
                                 │        └─► ADDITIONAL_INPUT_REQUIRED + guidance
                  242-D features ┤ HSV/Lab histograms · colour moments
                                 │ GLCM · LBP · lesion stats · Hu moments
                     classifier  ┤ calibrated logistic regression / linear SVM
                                 │
                    high-risk rule ┤ pesticide-implying class never auto-confirms
                                 ▼
                        routing layer ──► one of four states
```

The routing layer (`src/agrisense/routing.py`) is shared and evidence-first:
**bad input is refused before confidence is ever consulted.** A confident
prediction on a blurry photo is worse than no prediction. Ordering:

1. quality failure → `ADDITIONAL_INPUT_REQUIRED`
2. out of distribution → `ADDITIONAL_INPUT_REQUIRED`
3. below review floor → `EXPERT_REQUIRED`
4. high-risk class → `REVIEW_REQUIRED`, or `EXPERT_REQUIRED` if uncertain
5. confident **and** decisive margin → `HIGH_CONFIDENCE`
6. otherwise → `REVIEW_REQUIRED`

Every decision carries a machine-readable `reason`, so the UI can say *why*.

---

## 4. Algorithm choices

| Component | Choice | Why |
|---|---|---|
| Crop classifier | Bake-off: Random Forest, Extra Trees, HistGradientBoosting, RBF-SVM, logistic regression | 2,200×7 tabular. Trees are the right default: no scaling, native multiclass, tiny artifact. |
| Crop selection rule | **Lowest Brier score**, tie-break on accuracy | Accuracy is saturated at ~100% and cannot discriminate. The routing layer *spends* the probability, so probability quality is the thing to optimise. |
| Crop calibration | `CalibratedClassifierCV`, sigmoid vs isotonic compared | Tree ensembles are over-confident at the top of the range. |
| Novelty gate | IsolationForest, cutoff at the 1st percentile of training scores | Permissive: flags only genuinely unusual input. |
| Disease features | 242-D: HSV+Lab histograms, colour moments, GLCM (2 distances × 4 angles), LBP (P=8/R=1, P=16/R=2), lesion statistics, Hu moments | Encodes what a pathologist looks at. HSV/Lab not RGB, so shade and sun land near each other. |
| Disease classifier | Bake-off: logistic regression, LinearSVC, Random Forest, HistGradientBoosting, PCA+SVC | Literature favours linear models on this descriptor; measured, not assumed. |
| Disease selection rule | **Macro-F1** | 38 classes with uneven support; plain accuracy hides failure on rare diseases. |
| Disease calibration | Sigmoid (Platt) by default | Isotonic overfits with many classes and limited per-class data. |

**XGBoost was considered and rejected.** It adds a dependency and, on 2,200
rows of near-separable tabular data, buys nothing over
`HistGradientBoostingClassifier`, which is already in scikit-learn. Fewer
moving parts matters more in a two-day build. The Phase 1 doc says "Random
Forest or XGBoost" — the bake-off tests both families and reports the winner.

---

## 5. Evaluation protocol

Accuracy alone cannot justify a confidence threshold. Every training run
prints, and writes to a JSON report:

1. **Dataset profile** — row counts, class balance, feature ranges. Nothing assumed.
2. **Bake-off** — every candidate, same split.
3. **Calibration** — ECE and multiclass Brier. Above ~0.05 ECE the confidence
   number is misleading and must not be shown to a farmer as-is.
4. **Reliability table** — stated confidence vs. observed accuracy, per bin.
   This is the evidence that a "0.9" means anything.
5. **Threshold sweep** — coverage vs. selective accuracy for every
   (confidence, margin) pair. **This table sets `configs/routing.yaml`.**
   Read it as: "auto-confirming here answers X% of cases and is right Y% of
   the time on those."
6. **Field check** — `scripts/eval_field.py` against PlantDoc.

On the field check, the target is **not** high accuracy — classical features
will not deliver that on field photos, and neither would a CNN trained on
PlantVillage. The target is that the system *refuses rather than guesses*:

- low field accuracy + **low** `HIGH_CONFIDENCE` rate = correct, safe system
- low field accuracy + **high** `HIGH_CONFIDENCE` rate = dangerous; thresholds
  are too permissive

That contrast is the single most persuasive slide available: *"94% in the lab,
X% in the field — which is exactly why we route to a human instead of
pretending."*

---

## 6. Execution order

Against the Phase 4 two-day plan:

**Day 1 morning** — `pip install -r requirements.txt`; download both datasets;
verify the pipeline on the bundled synthetic CSV (`scripts/run_all.sh --smoke`)
before the real download finishes.

**Day 1 afternoon** — `crop.train` (~2 min). Read the threshold sweep, set
`configs/routing.yaml [crop]`. Start `disease.extract` in the background
(~3–6 min for all 88k images at 8 cores; use `--max-per-class 300` for a fast
first pass). Hand Payal and Shubham real response samples from `/health` and
both endpoints.

**Day 2 morning** — `disease.train`, set `[disease]` thresholds from its sweep.
Run `scripts/prove_leakage.py` and record the number. Integrate with Payal.

**Day 2 afternoon** — `scripts/eval_field.py` on PlantDoc. Record the field
number and the `HIGH_CONFIDENCE` rate. Write the model card limitations into
the README. Rehearse.

---

## 7. What the demo may and may not claim

**Say:**
- "X% on held-out lab images, on a leakage-free split we had to build ourselves."
- "Y% on real field photos — and here is why we designed for that gap."
- "The model abstains on Z% of field images instead of guessing."
- "Thresholds come from this measured sweep, not from a round number we liked."

**Do not say:**
- Any accuracy figure from the dataset's shipped train/valid split.
- That the crop model predicts yield, profit, or that a crop will succeed.
- That any number generalises to a farm not represented in the training data.
- That the disease model is a diagnosis. It is a possible identification
  pending verification.

---

## 8. Known limitations (put these in the model card)

1. Crop data is synthetic and India-biased. The model reproduces the
   *dataset's* logic, not agronomic truth. The novelty gate limits the damage;
   it does not remove it.
2. Disease training data is laboratory imagery. Field performance is
   materially worse and must be measured, not extrapolated.
3. 38 classes cover 14 species. Anything outside that list is silently mapped
   to the nearest known class — the quality gate and confidence floor are the
   only defences. A dedicated "unknown species" gate is future work.
4. The high-risk substring list is a blunt instrument. An agronomist should
   review the class-to-risk mapping before any real deployment.
5. Thresholds shipped in `configs/routing.yaml` are placeholders **until
   training is run**. They must be reset from the sweep.

---

## 9. References

- [Crop Recommendation Dataset — Kaggle](https://www.kaggle.com/datasets/atharvaingle/crop-recommendation-dataset)
- [New Plant Diseases Dataset — Kaggle](https://www.kaggle.com/datasets/vipoooool/new-plant-diseases-dataset)
- [PlantVillage-Dataset — original source](https://github.com/spmohanty/plantvillage-dataset)
- [PlantDoc: A Dataset for Visual Plant Disease Detection](https://arxiv.org/pdf/1911.10317)
- [FieldPlant: A Dataset of Field Plant Images (IEEE)](https://ieeexplore.ieee.org/document/10086516/) — documents the lab→field accuracy collapse
- [Plant Diseases Classification using Machine Learning (IOP)](https://iopscience.iop.org/article/10.1088/1742-6596/1962/1/012024/pdf) — classical handcrafted-feature baselines
- [Evaluation of ML Models Using Modified GLCM and Wavelet Features (IIETA)](https://www.iieta.org/journals/ts/paper/10.18280/ts.390602)
- [AgroXAI: Explainable AI-Driven Crop Recommendation](https://arxiv.org/pdf/2412.16196) — documents the crop dataset's geographic bias
- [Crop recommendation with uncertainty quantification (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2590123025015750) — on the missing-uncertainty gap
