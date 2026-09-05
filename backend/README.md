# AgriSense AI — Backend (Express / MongoDB)

The orchestration layer for AgriSense AI's Grow–Protect–Sell loop. It proxies
the live AI service, persists every prediction as evidence, normalizes
weather/market integrations, and runs the confidence-routing and
human-review workflow described in the SDLC Phase 2/3 docs.

**Never fabricates a prediction.** If the AI service, the database, or an
external integration is unreachable, this service returns a structured
`dependency_unavailable` / `model_unavailable` error — it does not invent a
result.

## Requirements

- Node.js 18+
- MongoDB reachable at `MONGODB_URI` (local `mongod`, Docker, or Atlas)
- The AgriSense AI FastAPI service running and reachable at `AI_SERVICE_URL`

## Setup

```bash
npm install
cp .env.example .env
# edit .env — at minimum confirm MONGODB_URI and AI_SERVICE_URL
npm start
# or, for auto-restart on file changes:
npm run dev
```

The server listens on `PORT` (default `4000`). All routes are under
`/api/v1`.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `4000` | |
| `NODE_ENV` | no | `development` | |
| `MONGODB_URI` | **yes** | — | e.g. `mongodb://127.0.0.1:27017/agrisense` |
| `AI_SERVICE_URL` | **yes** | — | Base URL of Khushboo's FastAPI service, e.g. `http://localhost:8001` |
| `AI_SERVICE_TIMEOUT_MS` | no | `8000` | |
| `WEATHER_API_URL` | no | Open-Meteo forecast endpoint | No API key needed |
| `WEATHER_TIMEOUT_MS` | no | `6000` | |
| `MARKET_API_URL` | no | *(empty)* | Unset = market endpoint always returns `dependency_unavailable` until a real Agmarknet-shaped source is wired in — see `src/services/marketClient.js` |
| `MARKET_API_KEY` | no | *(empty)* | |
| `MARKET_TIMEOUT_MS` | no | `6000` | |
| `MAX_IMAGE_UPLOAD_BYTES` | no | `8388608` (8MB) | Matches the AI service's own limit |
| `REVIEW_MIN_REVIEWS_FOR_CONSENSUS` | no | `2` | See "Consensus rule" below |
| `REVIEW_CONSENSUS_THRESHOLD` | no | `0.34` | |
| `REVIEW_DISAGREEMENT_MIN_MINORITY_FRACTION` | no | `0.34` | |

Never hardcode these — the app throws on boot if `MONGODB_URI` or
`AI_SERVICE_URL` is missing (`src/config/env.js`).

## Project structure

```
src/
  routes/       versioned Express routers, one per resource
  controllers/  request validation + HTTP responses (thin)
  services/     aiClient, weatherClient, marketClient, reviewService, advisoryService
  models/       Farmer, Field, Query, ModelOutput, Review, VerificationResult
  config/       env loading, MongoDB connection
  middleware/   error handling, upload validation, request-id
  utils/        structured errors, validators, hashing
  app.js        Express app wiring
  server.js     entrypoint
```

## Confidence routing

The AI service (per `API_CONTRACT.md`) already computes `routingStatus` and
a stable `reason` code for every prediction — this backend doesn't
recompute it. What this backend owns instead:

1. Assigns `predictionId` and persists the AI service's raw response as a
   `ModelOutput`, **before** anything else happens to it.
2. If `routingStatus` is `REVIEW_REQUIRED`, opens a review case
   (`VerificationResult`) automatically.
3. Runs the review/consensus workflow, which is the *only* thing that can
   move a prediction from `REVIEW_REQUIRED` to a final state
   (`HIGH_CONFIDENCE` or `EXPERT_REQUIRED`).

### Consensus rule (transparent, per Phase 2 §7)

Implemented in `src/services/reviewService.js::recomputeConsensus`. On every
review submission:

1. Each reviewer's decision contributes `decisionValue × reputation` to a
   weighted sum (`AGREE=+1`, `DISAGREE=-1`, `UNSURE=0`; reputation defaults
   to `1`). `weightedScore = weightedSum / totalReputationWeight`, in
   `[-1, 1]`.
2. Fewer than `REVIEW_MIN_REVIEWS_FOR_CONSENSUS` reviews → stays
   `REVIEW_REQUIRED` (`PENDING`).
3. **Significant disagreement** — both `AGREE` and `DISAGREE` present, and
   the minority side is ≥ `REVIEW_DISAGREEMENT_MIN_MINORITY_FRACTION` of all
   reviews — always escalates to `EXPERT_REQUIRED`, regardless of the
   weighted score. This is checked before anything else, so a confident
   majority can't paper over a substantial minority objection.
4. Otherwise: `weightedScore ≥ REVIEW_CONSENSUS_THRESHOLD` → `AGREE`
   consensus → `HIGH_CONFIDENCE`. `weightedScore ≤ -threshold` → `DISAGREE`
   consensus → `EXPERT_REQUIRED` (a confident community "no" still needs an
   expert, it's never silently dropped). Anything in between →
   `MIXED` → `EXPERT_REQUIRED`.
5. High-risk-class predictions (AI `reason` of
   `high_risk_class_requires_verification` /
   `high_risk_class_and_uncertain`) go through the same rule — they already
   arrived at `REVIEW_REQUIRED` specifically because they're high-risk, so
   any non-clean-AGREE outcome escalates via the paths above.

`decisionReason` on the `VerificationResult` always records which branch
fired, so the outcome is auditable, not just the final state.

## Endpoints

See `API_CONTRACT.md` for the full request/response reference, including
this backend's additions beyond the Phase 2 baseline (`/farmers`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | DB + AI service reachability |
| POST | `/api/v1/ai/recommend/crop` | Proxy crop recommendation, persist, route |
| POST | `/api/v1/ai/analyze/disease` | Proxy disease analysis (multipart `image`), persist, route |
| GET | `/api/v1/weather/forecast?latitude=&longitude=` | Open-Meteo, normalized |
| GET | `/api/v1/market/prices?commodity=&market=&state=` | Agmarknet-shaped adapter |
| POST | `/api/v1/review/create` | Open a review case for a `REVIEW_REQUIRED` prediction |
| POST | `/api/v1/review/submit` | Submit one reviewer's decision, recompute consensus |
| GET | `/api/v1/review/status/:id` | Current `VerificationResult` for a prediction |
| GET | `/api/v1/advisory/:id` | Combined farmer-facing view of a prediction |
| POST | `/api/v1/farmers` | Create a farmer *(backend addition — see API_CONTRACT.md)* |
| GET | `/api/v1/farmers/:id` | Fetch a farmer |
| POST | `/api/v1/farmers/:id/fields` | Add a field to a farmer |
| GET | `/api/v1/farmers/:id/fields` | List a farmer's fields |

## Structured errors

Every error response has the shape `{ "error": "<code>", "message": "...", "details"?: ... }`
with `<code>` one of: `validation_error`, `dependency_unavailable`,
`model_unavailable`, `upload_invalid`, `not_found`. A database outage and an
AI-service outage both surface as `dependency_unavailable` — distinct
dependencies are named in `details.dependency`.

## Verified so far

This build was smoke-tested in a sandbox without a live MongoDB or the real
AI service, using a stubbed AI service that matches `API_CONTRACT.md`
exactly. Confirmed working:

- Server boots and stays up even when MongoDB and the AI service are both
  unreachable; `/api/v1/health` reports `degraded` honestly.
- Crop-recommendation validation rejects missing/out-of-range fields with
  `validation_error` and the specific field-level `details`.
- An unreachable AI service surfaces as `dependency_unavailable`, not a
  fabricated result.
- Image upload validation sniffs actual file content (not the declared
  `Content-Type`): a text file renamed to `.jpg` is rejected as
  `upload_invalid`; a real PNG passes even when the multipart request lies
  about it being a JPEG.
- An unreachable database surfaces as `dependency_unavailable` (not a
  generic 500), and fails fast instead of waiting out Mongoose's default
  10s command-buffering timeout (`bufferCommands: false`).
- 404s for unknown routes return the same structured-error shape as
  everything else.

**Not yet verified against a real MongoDB instance** (unavailable in the
build sandbox): the review/consensus arithmetic, `ModelOutput` persistence,
and the farmer/field endpoints have been reviewed carefully but not
exercised against a live database or the real AI service. Run the two
"real end-to-end path" checks in the "What to hand back" section below
before treating this as demo-ready.

## What to verify next (with real Mongo + real AI service running)

1. **Crop path**: submit a valid crop form → confirm a `ModelOutput` is
   created with the AI service's real `predictionId`-less response now
   carrying a backend-assigned `predictionId` → confirm `routingStatus`
   matches what the AI service returned.
2. **Disease + review path**: upload a real image that returns
   `REVIEW_REQUIRED` → confirm a `VerificationResult` was auto-created →
   submit 2+ reviews via `/api/v1/review/submit` → confirm `GET
   /api/v1/review/status/:id` and `GET /api/v1/advisory/:id` agree on the
   final state.
3. **Out-of-distribution / low-quality-image cases** from `API_CONTRACT.md`
   → confirm they surface as `ADDITIONAL_INPUT_REQUIRED` end-to-end, not
   silently dropped.
