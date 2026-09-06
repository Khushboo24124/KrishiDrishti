// Centralized API service. Every backend call in the app goes through here.
// Base URL is environment-based (Phase 2 §3 "Maintainability": centralized
// API client on frontend). Never hardcode the backend origin elsewhere.

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

// Normalizes the backend's error taxonomy (API_CONTRACT.md "Backend errors")
// into a single Error shape the UI can branch on: err.code, err.message,
// err.details, err.status.
class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message || code || "Request failed");
    this.status = status;
    this.code = code || "unknown_error";
    this.details = details;
  }
}

async function handleResponse(res) {
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    throw new ApiError({
      status: res.status,
      code: body?.error || `http_${res.status}`,
      message: body?.message || res.statusText,
      details: body?.details,
    });
  }
  return body;
}

async function request(path, { method = "GET", json, formData, signal } = {}) {
  const opts = { method, signal, headers: {} };

  if (formData) {
    opts.body = formData; // browser sets multipart boundary
  } else if (json !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(json);
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, opts);
  } catch (networkErr) {
    // Backend unreachable entirely (server down, CORS, offline).
    throw new ApiError({
      status: 0,
      code: "dependency_unavailable",
      message: "Could not reach the AgriSense backend. Is it running?",
      details: { dependency: "backend", original: networkErr.message },
    });
  }
  return handleResponse(res);
}

export const api = {
  // ---- Health ----
  health: () => request("/api/v1/health"),

  // ---- Farmers (Phase 3 §4 backend addition; used here as lightweight auth) ----
  createFarmer: ({ language, location, phone }) =>
    request("/api/v1/farmers", { method: "POST", json: { language, location, phone } }),
  getFarmer: (id) => request(`/api/v1/farmers/${id}`),
  listFields: (farmerId) => request(`/api/v1/farmers/${farmerId}/fields`),
  createField: (farmerId, field) =>
    request(`/api/v1/farmers/${farmerId}/fields`, { method: "POST", json: field }),

  // ---- Grow: crop recommendation ----
  recommendCrop: (payload) =>
    request("/api/v1/ai/recommend/crop", { method: "POST", json: payload }),

  // ---- Protect: disease analysis ----
  analyzeDisease: ({ file, farmerId, fieldId }) => {
    const fd = new FormData();
    fd.append("image", file);
    if (farmerId) fd.append("farmerId", farmerId);
    if (fieldId) fd.append("fieldId", fieldId);
    return request("/api/v1/ai/analyze/disease", { method: "POST", formData: fd });
  },

  // ---- Sell: weather + market ----
  getWeather: (latitude, longitude) =>
    request(`/api/v1/weather/forecast?latitude=${latitude}&longitude=${longitude}`),
  getMarketPrices: ({ commodity, market, state }) => {
    const params = new URLSearchParams({ commodity });
    if (market) params.set("market", market);
    if (state) params.set("state", state);
    return request(`/api/v1/market/prices?${params.toString()}`);
  },

  // ---- Advisory (farmer-facing final state) ----
  getAdvisory: (predictionId) => request(`/api/v1/advisory/${predictionId}`),

  // ---- Review workflow ----
  createReview: (predictionId) =>
    request("/api/v1/review/create", { method: "POST", json: { predictionId } }),
  submitReview: ({ predictionId, reviewerId, decision, reputation }) =>
    request("/api/v1/review/submit", {
      method: "POST",
      json: { predictionId, reviewerId, decision, reputation },
    }),
  getReviewStatus: (predictionId) => request(`/api/v1/review/status/${predictionId}`),
};

export { ApiError };
