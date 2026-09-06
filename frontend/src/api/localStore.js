// The backend (per API_CONTRACT.md) has no "list pending reviews" endpoint —
// only create/submit/status-by-id. Until Payal adds one, this module keeps a
// local, per-browser record of prediction IDs the app has seen, so the
// Review Dashboard has something to list. This is explicitly a client-side
// workaround, not a source of truth — see README "Known Gaps".

const FARMER_KEY = "agrisense.farmer";
const REVIEWER_KEY = "agrisense.reviewerId";
const KNOWN_PREDICTIONS_KEY = "agrisense.knownPredictions";

export function getFarmerSession() {
  try {
    return JSON.parse(localStorage.getItem(FARMER_KEY) || "null");
  } catch {
    return null;
  }
}

export function setFarmerSession(farmer) {
  localStorage.setItem(FARMER_KEY, JSON.stringify(farmer));
}

export function clearFarmerSession() {
  localStorage.removeItem(FARMER_KEY);
}

export function getReviewerId() {
  return localStorage.getItem(REVIEWER_KEY) || "";
}

export function setReviewerId(id) {
  localStorage.setItem(REVIEWER_KEY, id);
}

export function getKnownPredictions() {
  try {
    return JSON.parse(localStorage.getItem(KNOWN_PREDICTIONS_KEY) || "[]");
  } catch {
    return [];
  }
}

// Records a prediction locally so the Review Dashboard can surface it.
// `meta` carries just enough context to render a useful card without
// re-fetching (type, crop/disease guess, routingStatus at creation time).
export function rememberPrediction(predictionId, meta = {}) {
  const list = getKnownPredictions().filter((p) => p.predictionId !== predictionId);
  list.unshift({ predictionId, ...meta, savedAt: new Date().toISOString() });
  localStorage.setItem(KNOWN_PREDICTIONS_KEY, JSON.stringify(list.slice(0, 100)));
}

export function forgetPrediction(predictionId) {
  const list = getKnownPredictions().filter((p) => p.predictionId !== predictionId);
  localStorage.setItem(KNOWN_PREDICTIONS_KEY, JSON.stringify(list));
}
