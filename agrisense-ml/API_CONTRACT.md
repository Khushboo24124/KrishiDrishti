# AgriSense AI service — API contract

Base URL: `http://localhost:8001` (set `AI_SERVICE_URL` in the backend).
All paths versioned under `/api/v1`, per Phase 3 §8.

This service returns **model evidence**. It does not assign `predictionId` and
does not persist anything — Phase 3 §4 gives both to the Express backend.

---

## `GET /api/v1/health`

```json
{
  "status": "ok",
  "cropModel": "crop-extra_trees-0.1.0",
  "diseaseModel": "disease-logreg-0.1.0",
  "errors": []
}
```

`status` is `"degraded"` when an artifact failed to load; `errors` names which.
The affected endpoint then returns `503 model_unavailable`.

---

## `POST /api/v1/ai/recommend/crop`

Request:

```json
{
  "nitrogen": 83, "phosphorus": 122, "potassium": 150,
  "temperature": 21.1, "humidity": 54.1, "ph": 7.8, "rainfall": 39.0,
  "location": { "latitude": 19.07, "longitude": 72.87 }
}
```

`location` is optional and currently unused by the model. All seven numeric
fields are required.

Response `200`:

```json
{
  "recommendedCrop": "rice",
  "disease": null,
  "crop": null,
  "confidence": 1.0,
  "margin": 1.0,
  "modelVersion": "crop-extra_trees-0.1.0",
  "routingStatus": "HIGH_CONFIDENCE",
  "reason": "confidence_and_margin_met",
  "message": "Likely result. Confirm against local conditions before acting.",
  "evidence": {
    "novelty_score": -0.5266,
    "novelty_threshold": -0.5498,
    "top_3": [{ "crop": "rice", "probability": 1.0 }]
  }
}
```

When the input falls outside the training distribution, `recommendedCrop` is
`null` and `routingStatus` is `ADDITIONAL_INPUT_REQUIRED`:

```json
{
  "recommendedCrop": null,
  "confidence": 0.3011,
  "routingStatus": "ADDITIONAL_INPUT_REQUIRED",
  "reason": "input_outside_training_distribution"
}
```

---

## `POST /api/v1/ai/analyze/disease`

`multipart/form-data`, field name `image`. JPEG/PNG/WebP, max 8 MB. The
declared content-type is ignored; the file is decoded to determine its format.

Response `200` (identified, but a pesticide-implying class):

```json
{
  "recommendedCrop": null,
  "disease": "Late blight",
  "crop": "Tomato",
  "confidence": 0.9598,
  "margin": 0.9426,
  "modelVersion": "disease-logreg-0.1.0",
  "routingStatus": "REVIEW_REQUIRED",
  "reason": "high_risk_class_requires_verification",
  "message": "Under verification. This result is not confirmed yet.",
  "evidence": {
    "quality": { "blur_variance": 812.3, "leaf_fraction": 0.71, "mean_luma": 102.4 },
    "top_3": [
      { "label": "Tomato___Late_blight", "probability": 0.9598 },
      { "label": "Apple___Apple_scab", "probability": 0.0172 }
    ]
  }
}
```

Response `200` (rejected before the model ran):

```json
{
  "disease": null, "crop": null, "confidence": 0.0,
  "routingStatus": "ADDITIONAL_INPUT_REQUIRED",
  "reason": "input_quality_insufficient",
  "message": "We need clearer input before we can analyse this.",
  "evidence": {
    "quality": { "blur_variance": 12.1, "leaf_fraction": 0.03, "mean_luma": 128.0 },
    "quality_failures": ["image_too_blurry", "no_clear_leaf_detected"],
    "guidance": [
      "The photo is out of focus. Hold the phone steady and tap the leaf to focus.",
      "We could not find a leaf. Fill the frame with a single leaf."
    ]
  }
}
```

---

## `routingStatus` values

| Status | Meaning | Backend action |
|---|---|---|
| `HIGH_CONFIDENCE` | Confident and decisive | Return advisory; keep audit record |
| `REVIEW_REQUIRED` | Uncertain, or a high-risk class | Create a review case |
| `ADDITIONAL_INPUT_REQUIRED` | Evidence unusable or out of distribution | Ask the farmer for better input; re-run |
| `EXPERT_REQUIRED` | Too uncertain, or high-risk and uncertain | Escalate to an agricultural officer |

`reason` is a stable machine-readable code — safe to switch on:

`confidence_and_margin_met` · `confidence_below_high_threshold` ·
`margin_between_top_two_too_small` · `confidence_below_review_floor` ·
`input_quality_insufficient` · `input_outside_training_distribution` ·
`high_risk_class_requires_verification` · `high_risk_class_and_uncertain`

---

## Errors

| HTTP | `error` | Cause |
|---|---|---|
| 400 | `validation_error` | Missing field, non-numeric, or outside a plausible range. `details` is a list of strings. |
| 400 | `upload_invalid` | Empty, corrupt, oversized, or unsupported image. |
| 503 | `model_unavailable` | Artifact not loaded. Check `/api/v1/health`. |

```json
{ "error": "validation_error", "details": ["ph=99.0 is outside the plausible range [0.0, 14.0]"] }
```

**The service never fabricates a prediction when a model is unavailable.** It
returns 503, per Phase 4's "do not invent prediction data" rule.
