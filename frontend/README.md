# AgriSense AI — Frontend (Shubham's scope)

React + Vite + Tailwind + react-router. Talks only to Payal's Express
backend via one centralized API client (`src/api/client.js`) — never
directly to the FastAPI AI service or MongoDB.

## Run it

```bash
cd frontend
cp .env.example .env      # set VITE_BACKEND_URL if not http://localhost:4000
npm install
npm run dev               # http://localhost:5173
```

Requires the backend (`backend/`) running with a reachable AI service and
MongoDB, per the backend's own README.

## What's implemented

- **Farmer "auth"**: `/login` — create a farmer profile (`POST /api/v1/farmers`,
  phone hashed server-side) or sign back in with a previously issued
  Farmer ID (`GET /api/v1/farmers/:id`). Session kept in `localStorage`.
- **Grow**: soil/environment form → `POST /api/v1/ai/recommend/crop`.
- **Protect**: image upload (JPEG/PNG/WebP, 8MB, client + server validated)
  → `POST /api/v1/ai/analyze/disease`.
- **Sell**: `GET /api/v1/weather/forecast`, `GET /api/v1/market/prices`,
  including the honest "unavailable" state when `MARKET_API_URL` isn't set.
- **Confidence-aware UI**: a single `StatusBadge`/`PredictionResult`
  component renders `routingStatus` consistently everywhere — uncertain
  results always say "Under verification" or ask for more input, never
  presented as confirmed (Phase 1 §7, Phase 3 §7).
- **Advisory tracking**: `/advisory/:predictionId` polls
  `GET /api/v1/advisory/:id` for the merged prediction + review state.
- **Review Dashboard** (`/review`, no farmer login required — reviewers are
  a separate user type per Phase 1 §4): reviewer ID field (hashed
  server-side), AGREE/DISAGREE/UNSURE buttons, live agree/disagree/unsure
  counts and consensus/finalState, using `POST /api/v1/review/create`,
  `POST /api/v1/review/submit`, `GET /api/v1/review/status/:id`.
- Loading/error/empty states throughout; all backend error codes
  (`validation_error`, `upload_invalid`, `not_found`, `dependency_unavailable`,
  `model_unavailable`) are surfaced with their `message`/`details`, never
  swallowed or faked.

## Known gaps (backend additions that would improve this)

1. **No "list pending reviews" endpoint.** The contract only has
   create/submit/status-**by-id**. The Review Dashboard works around this
   by remembering `predictionId`s locally (`src/api/localStore.js`) the
   moment a crop/disease call returns `REVIEW_REQUIRED`, plus a manual
   "add a prediction ID" box for cross-device reviewing. A real deployment
   should add `GET /api/v1/review/pending` (e.g. all `VerificationResult`s
   with `finalState: REVIEW_REQUIRED`) and this dashboard should switch to
   that instead of `localStorage`.
2. **No password/OTP auth.** `POST /api/v1/farmers` has no credential —
   whoever holds a `farmerId` can fetch that profile. Fine for a hackathon
   demo; swap for real OTP-based auth (e.g. via the WhatsApp/IVR channel
   layer mentioned in Phase 3 §8) before any real deployment.
3. **No reviewer identity/reputation system** beyond the raw `reviewerId`
   string the contract hashes — there's no reviewer login, so nothing stops
   someone typing a new ID each time. Acceptable for the MVP demo per the
   Phase 4 plan's "Reviewer bias/disagreement" risk row, flagged for
   follow-up.

## Folder structure

```
src/
  api/client.js        one fetch wrapper for every backend endpoint
  api/localStore.js     farmer session + reviewer id + known-predictions cache
  context/AuthContext   farmer "auth" state
  components/          StatusBadge, PredictionResult, States, Navbar
  pages/                Login, Dashboard, Grow, Protect, Sell, Advisory,
                        History, ReviewDashboard
```
