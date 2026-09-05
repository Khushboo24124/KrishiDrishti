const axios = require("axios");
const env = require("../config/env");
const {
  ValidationError,
  UploadInvalidError,
  ModelUnavailableError,
  DependencyUnavailableError,
} = require("../utils/errors");

const client = axios.create({
  baseURL: env.aiServiceUrl,
  timeout: env.aiServiceTimeoutMs,
});

/**
 * Maps a failure calling the AI service onto our structured error taxonomy.
 * The AI service's own 400/503 bodies (validation_error / upload_invalid /
 * model_unavailable) are passed through as-is — we don't reinterpret them.
 * Anything else (timeout, connection refused, 5xx) becomes
 * dependency_unavailable: the AI service is reachable-but-broken or
 * unreachable, which is a different failure mode than "it told us no".
 */
function translateAxiosError(err, opName) {
  if (err.response) {
    const body = err.response.data || {};
    const status = err.response.status;
    if (status === 400 && body.error === "validation_error") {
      return new ValidationError(body.details, body.message);
    }
    if (status === 400 && body.error === "upload_invalid") {
      return new UploadInvalidError(body.message, body.details);
    }
    if (status === 503 && body.error === "model_unavailable") {
      return new ModelUnavailableError(body.message, body.details);
    }
    // Unexpected shape/status from the AI service — still its fault, still
    // "unavailable" from the caller's point of view, not a client error.
    return new DependencyUnavailableError(
      "ai-service",
      `AI service returned an unexpected error during ${opName} (status ${status}).`
    );
  }
  // No response at all: timeout, ECONNREFUSED, DNS failure, etc.
  return new DependencyUnavailableError(
    "ai-service",
    `AI service is unreachable during ${opName}: ${err.message}`
  );
}

async function checkHealth() {
  try {
    const { data } = await client.get("/api/v1/health");
    return data;
  } catch (err) {
    // Health checks should never throw upward with a stack trace — the
    // caller (health controller) wants a status object either way.
    return { status: "unreachable", error: err.message };
  }
}

/**
 * @param {object} input - { nitrogen, phosphorus, potassium, temperature,
 *                            humidity, ph, rainfall, location? }
 * @returns {object} the AI service's raw JSON response
 */
async function recommendCrop(input) {
  try {
    const { data } = await client.post("/api/v1/ai/recommend/crop", input);
    return data;
  } catch (err) {
    throw translateAxiosError(err, "crop recommendation");
  }
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} filename
 * @param {string} contentType - sniffed content type (not the client's claim)
 * @returns {object} the AI service's raw JSON response
 */
async function analyzeDisease(imageBuffer, filename, contentType) {
  const FormData = require("form-data");
  const form = new FormData();
  form.append("image", imageBuffer, {
    filename: filename || "upload.jpg",
    contentType,
  });

  try {
    const { data } = await client.post("/api/v1/ai/analyze/disease", form, {
      headers: form.getHeaders(),
      maxContentLength: env.maxImageUploadBytes + 1024,
      maxBodyLength: env.maxImageUploadBytes + 1024,
    });
    return data;
  } catch (err) {
    throw translateAxiosError(err, "disease analysis");
  }
}

module.exports = { checkHealth, recommendCrop, analyzeDisease };
