// Loads and validates environment configuration. Fail fast and loudly if a
// required variable is missing — per Phase 3 §9, secrets/URLs must come from
// the environment, never be hardcoded, and their absence must be obvious.
require("dotenv").config();

function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    // MARKET_API_URL is intentionally allowed to be empty — the market
    // adapter treats an unconfigured provider as a normal "unavailable"
    // state (see services/marketClient.js), not a boot-time failure.
    if (name === "MARKET_API_URL" || name === "MARKET_API_KEY") return "";
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(requireEnv("PORT", "4000"), 10),

  mongodbUri: requireEnv("MONGODB_URI"),

  aiServiceUrl: requireEnv("AI_SERVICE_URL"),
  aiServiceTimeoutMs: parseInt(requireEnv("AI_SERVICE_TIMEOUT_MS", "8000"), 10),

  weatherApiUrl: requireEnv(
    "WEATHER_API_URL",
    "https://api.open-meteo.com/v1/forecast"
  ),
  weatherTimeoutMs: parseInt(requireEnv("WEATHER_TIMEOUT_MS", "6000"), 10),

  marketApiUrl: requireEnv("MARKET_API_URL"),
  marketApiKey: requireEnv("MARKET_API_KEY"),
  marketTimeoutMs: parseInt(requireEnv("MARKET_TIMEOUT_MS", "6000"), 10),

  maxImageUploadBytes: parseInt(
    requireEnv("MAX_IMAGE_UPLOAD_BYTES", String(8 * 1024 * 1024)),
    10
  ),

  review: {
    minReviewsForConsensus: parseInt(
      requireEnv("REVIEW_MIN_REVIEWS_FOR_CONSENSUS", "2"),
      10
    ),
    consensusThreshold: parseFloat(
      requireEnv("REVIEW_CONSENSUS_THRESHOLD", "0.34")
    ),
    disagreementMinMinorityFraction: parseFloat(
      requireEnv("REVIEW_DISAGREEMENT_MIN_MINORITY_FRACTION", "0.34")
    ),
  },
};

module.exports = env;
