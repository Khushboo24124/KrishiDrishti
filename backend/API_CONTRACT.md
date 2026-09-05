# AgriSense AI — API contract

This file now covers **both** services:

- The AI service (Khushboo) — unchanged from the original contract, kept
  verbatim below.
- The Express/MongoDB backend (Payal) — new section, added per the Team
  Execution PDF's "update API_CONTRACT.md with the backend's own endpoints"
  checklist item.

All backend paths are versioned under `/api/v1`, base URL configurable by
the frontend (`BACKEND_URL` or similar env var on Shubham's side — not
defined by this file).

---

# Part 1 — AI service (unchanged, source of truth: Khushboo)

Base URL: `http://localhost:8001` (set `AI_SERVICE_URL` in the backend).
All paths versioned under `/api/v1`, per Phase 3 §8.

This service returns **model evidence**. It does not assign `predictionId` and
does not persist anything — Phase 3 §4 gives both to the Express backend.

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

## AI service errors

| HTTP | `error` | Cause |
|---|---|---|
| 400 | `validation_error` | Missing field, non-numeric, or outside a plausible range. `details` is a list of strings. |
| 400 | `upload_invalid` | Empty, corrupt, oversized, or unsupported image. |
| 503 | `model_unavailable` | Artifact not loaded. Check `/api/v1/health`. |

```json
{ "error": "validation_error", "details": ["ph=99.0 is outside the plausible range [0.0, 14.0]"] }
```

**The AI service never fabricates a prediction when a model is unavailable.**
It returns 503, per Phase 4's "do not invent prediction data" rule. The
backend preserves this: if the AI service is unreachable or returns
`model_unavailable`, the backend passes through an equivalent structured
error rather than inventing a result. See "Backend errors" below.

---

# Part 2 — Backend (Express/MongoDB), added by Payal

Base URL: backend's own `PORT` (default `4000` in dev). All paths under
`/api/v1`.

## `GET /api/v1/health`

Reflects **both** MongoDB and AI-service reachability (not the AI service's
own health — this is the backend's composite view).

```json
{
  "status": "ok",
  "database": { "connected": true, "readyState": 1, "lastError": null },
  "aiService": {
    "status": "ok",
    "cropModel": "crop-extra_trees-0.1.0",
    "diseaseModel": "disease-logreg-0.1.0",
    "errors": []
  },
  "timestamp": "2026-09-05T19:56:32.177Z"
}
```

`status` is `"degraded"` if either dependency is down.

## `POST /api/v1/ai/recommend/crop`

Same request body as the AI service's own endpoint, plus two optional
backend-only fields:

```json
{
  "nitrogen": 83, "phosphorus": 122, "potassium": 150,
  "temperature": 21.1, "humidity": 54.1, "ph": 7.8, "rainfall": 39.0,
  "location": { "latitude": 19.07, "longitude": 72.87 },
  "farmerId": "farmer-uuid",
  "fieldId": "field-uuid"
}
```

`farmerId`/`fieldId` are optional; if provided (and `farmerId` exists), a
`Query` record is created linking this request to the farmer's history.

Response `200` — the AI service's response, with a backend-assigned
`predictionId` added at the front:

```json
{
  "predictionId": "b6e2b1a0-...-uuid",
  "recommendedCrop": "rice",
  "disease": null,
  "crop": null,
  "confidence": 1.0,
  "margin": 1.0,
  "modelVersion": "crop-extra_trees-0.1.0",
  "routingStatus": "HIGH_CONFIDENCE",
  "reason": "confidence_and_margin_met",
  "message": "Likely result. Confirm against local conditions before acting.",
  "evidence": { "...": "..." }
}
```

If `routingStatus` comes back `REVIEW_REQUIRED`, the backend automatically
opens a review case (equivalent to calling `POST /review/create` itself) —
the frontend does not need to call it separately for this to happen.

## `POST /api/v1/ai/analyze/disease`

`multipart/form-data`, field name `image` (same constraints as the AI
service: JPEG/PNG/WebP, max 8MB — enforced independently by the backend via
content sniffing, not just the declared `Content-Type`). Optional form
fields `farmerId`, `fieldId`.

Response `200` shape is identical to the crop endpoint's, with `predictionId`
added and the disease-specific fields (`disease`, `crop`) populated instead
of `recommendedCrop`.

## `GET /api/v1/weather/forecast?latitude={lat}&longitude={lng}`

Normalized Open-Meteo response:

```json
{
  "source": "open-meteo",
  "retrievedAt": "2026-09-05T19:56:32.177Z",
  "location": { "latitude": 19.07, "longitude": 72.87, "timezone": "Asia/Kolkata" },
  "current": { "temperature_2m": 29.1, "precipitation": 0, "weather_code": 1, "wind_speed_10m": 11.2 },
  "daily": { "temperature_2m_max": [...], "temperature_2m_min": [...], "precipitation_sum": [...] },
  "unavailable": false
}
```

On timeout/failure: `503 dependency_unavailable`
(`details.dependency = "weather-service"`) — never a stale/fabricated value.

## `GET /api/v1/market/prices?commodity={c}&market={m}&state={s}`

`commodity` is required; `market`/`state` are optional filters.

```json
{
  "source": "agmarknet",
  "retrievedAt": "2026-09-05T19:56:32.177Z",
  "query": { "commodity": "wheat", "market": null, "state": null },
  "prices": [
    { "commodity": "wheat", "market": "Azadpur", "state": "Delhi", "minPrice": 2100, "maxPrice": 2400, "modalPrice": 2250, "priceDate": "2026-09-04" }
  ],
  "unavailable": false
}
```

**Current build status**: no live Agmarknet source is configured yet
(`MARKET_API_URL` unset). Until it is, this endpoint always returns
`503 dependency_unavailable` — this is the intended "clear unavailable
state," not a bug. Set `MARKET_API_URL`/`MARKET_API_KEY` and adapt
`src/services/marketClient.js::mapResponse` to the real payload shape to go
live.

## `POST /api/v1/review/create`

```json
{ "predictionId": "b6e2b1a0-...-uuid" }
```

Creates (or returns, idempotently) a `VerificationResult` for a prediction
whose `routingStatus` is `REVIEW_REQUIRED`. Response `201`:

```json
{
  "predictionId": "b6e2b1a0-...-uuid",
  "reviewCount": 0,
  "consensus": "PENDING",
  "finalState": "REVIEW_REQUIRED"
}
```

`400 validation_error` if the prediction isn't currently `REVIEW_REQUIRED`.

## `POST /api/v1/review/submit`

```json
{
  "predictionId": "b6e2b1a0-...-uuid",
  "reviewerId": "raw-reviewer-identifier",
  "decision": "AGREE",
  "reputation": 1
}
```

`reviewerId` is hashed before storage (never stored raw — Phase 3 §9).
`decision` is one of `AGREE` / `DISAGREE` / `UNSURE`. `reputation` is
optional, defaults to `1`. Resubmitting with the same `reviewerId` updates
that reviewer's decision rather than adding a duplicate vote.

Response `200` — the recomputed `VerificationResult` (see README's
"Consensus rule" for exactly how `finalState` is derived):

```json
{
  "predictionId": "b6e2b1a0-...-uuid",
  "reviewCount": 2,
  "agreeCount": 2,
  "disagreeCount": 0,
  "unsureCount": 0,
  "weightedScore": 1,
  "consensus": "AGREE",
  "finalState": "HIGH_CONFIDENCE",
  "finalAdvisory": "Confirmed by community review. Still use judgement for local conditions.",
  "decisionReason": "reviewer_consensus_agree"
}
```

## `GET /api/v1/review/status/:id`

`:id` is the `predictionId`. Returns the current `VerificationResult` (same
shape as above). `404 not_found` if no review case exists yet.

## `GET /api/v1/advisory/:id`

`:id` is the `predictionId`. The single farmer-facing view — combines the
stored `ModelOutput` with any `VerificationResult`:

```json
{
  "predictionId": "b6e2b1a0-...-uuid",
  "type": "disease_analysis",
  "prediction": { "recommendedCrop": null, "disease": "Late blight", "crop": "Tomato" },
  "confidence": 0.9598,
  "modelVersion": "disease-logreg-0.1.0",
  "routingStatus": "HIGH_CONFIDENCE",
  "reason": "reviewer_consensus_agree_high_risk_confirmed",
  "message": "Confirmed by community review. Still use judgement for local conditions.",
  "review": { "reviewCount": 3, "consensus": "AGREE" },
  "createdAt": "2026-09-05T19:50:00.000Z"
}
```

`404 not_found` if `predictionId` doesn't exist.

## `POST /api/v1/farmers`, `GET /api/v1/farmers/:id`, `POST/GET /api/v1/farmers/:id/fields`

**Not in the original Phase 2 baseline table** — added because the crop/
disease endpoints accept an optional `farmerId`/`fieldId`, and Phase 2 §6
requires persisted `Farmers`/`Fields` collections. Minimal CRUD only;
flagged here for Shubham/Khushboo's awareness.

`POST /api/v1/farmers` body: `{ "language": "hi", "location": { "latitude": 19.07, "longitude": 72.87 }, "phone": "raw-phone-number" }`
— `phone` is hashed before storage, never returned raw.

`POST /api/v1/farmers/:id/fields` body: `{ "area": { "value": 2, "unit": "acre" }, "location": {...}, "soil": { "type": "loamy", "ph": 6.8 }, "currentCrop": "wheat" }`

## Backend errors

Same taxonomy as the AI service, extended with the backend's own failure
modes:

| HTTP | `error` | Cause |
|---|---|---|
| 400 | `validation_error` | Missing/invalid request fields (backend's own checks, independent of the AI service's) |
| 400 | `upload_invalid` | Image fails backend-side content-sniffing, size limit, or is missing |
| 404 | `not_found` | No record for the given `predictionId`/`farmerId`/route |
| 503 | `dependency_unavailable` | AI service, weather provider, market provider, or **database** unreachable. `details.dependency` names which. |
| 503 | `model_unavailable` | Passed through from the AI service when it reports an unloaded model artifact |

All error bodies: `{ "error": "<code>", "message": "...", "details"?: ... }`.

**The backend never fabricates a prediction, an advisory, or a persisted
record when a dependency is unavailable.** A database outage, for instance,
surfaces as `503 dependency_unavailable` (`details.dependency = "database"`)
rather than silently succeeding without persisting or synthesizing a fake
`predictionId`.
