const axios = require("axios");
const env = require("../config/env");
const { ValidationError, DependencyUnavailableError } = require("../utils/errors");

/**
 * Agmarknet-structured adapter. As of this build no MARKET_API_URL/API key
 * has been wired up (per Phase 1 §6, market integration is a "structured
 * path", not a guaranteed live source). Rather than fabricate prices, an
 * unconfigured provider is treated as a normal, clearly-labeled unavailable
 * state — same shape the caller would see on a real timeout.
 *
 * To go live: set MARKET_API_URL / MARKET_API_KEY and adapt `mapResponse`
 * to the real Agmarknet payload shape.
 */
async function getPrices({ commodity, market, state }) {
  if (!commodity) {
    throw new ValidationError(["commodity is a required query parameter"]);
  }

  const retrievedAt = new Date().toISOString();

  if (!env.marketApiUrl) {
    throw new DependencyUnavailableError(
      "market-service",
      "Market provider is not configured (MARKET_API_URL unset). " +
        "This is expected until a live Agmarknet source is connected."
    );
  }

  try {
    const { data } = await axios.get(env.marketApiUrl, {
      timeout: env.marketTimeoutMs,
      params: { commodity, market, state, "api-key": env.marketApiKey },
    });
    return mapResponse(data, { commodity, market, state, retrievedAt });
  } catch (err) {
    throw new DependencyUnavailableError(
      "market-service",
      `Market provider did not respond: ${err.message}`
    );
  }
}

/** Normalizes a raw Agmarknet-shaped payload into our response contract. */
function mapResponse(raw, { commodity, market, state, retrievedAt }) {
  const records = Array.isArray(raw?.records) ? raw.records : [];
  return {
    source: "agmarknet",
    retrievedAt,
    query: { commodity, market: market || null, state: state || null },
    prices: records.map((r) => ({
      commodity: r.commodity ?? commodity,
      market: r.market ?? market ?? null,
      state: r.state ?? state ?? null,
      minPrice: r.min_price ?? null,
      maxPrice: r.max_price ?? null,
      modalPrice: r.modal_price ?? null,
      priceDate: r.arrival_date ?? null,
    })),
    unavailable: false,
  };
}

module.exports = { getPrices };
