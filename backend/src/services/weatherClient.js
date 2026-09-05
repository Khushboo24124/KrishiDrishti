const axios = require("axios");
const env = require("../config/env");
const { ValidationError, DependencyUnavailableError } = require("../utils/errors");

const client = axios.create({
  baseURL: env.weatherApiUrl,
  timeout: env.weatherTimeoutMs,
});

/**
 * Fetches a forecast from Open-Meteo and normalizes it. Per Phase 3 §6, the
 * normalized response always includes provider/source and retrieval time,
 * and a clear unavailable state on timeout/failure — never a silent guess.
 */
async function getForecast(latitude, longitude) {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {
    throw new ValidationError([
      "latitude and longitude are required numeric query parameters",
    ]);
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new ValidationError(["latitude/longitude are outside plausible range"]);
  }

  const retrievedAt = new Date().toISOString();
  try {
    const { data } = await client.get("", {
      params: {
        latitude,
        longitude,
        current: "temperature_2m,precipitation,weather_code,wind_speed_10m",
        daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
        timezone: "auto",
      },
    });

    return {
      source: "open-meteo",
      retrievedAt,
      location: { latitude, longitude, timezone: data.timezone || null },
      current: data.current || null,
      daily: data.daily || null,
      unavailable: false,
    };
  } catch (err) {
    // Explicit unavailable state rather than fabricated/cached-as-if-live
    // data — Phase 3 §9 and Team Execution risk table both call this out.
    throw new DependencyUnavailableError(
      "weather-service",
      `Weather provider (Open-Meteo) did not respond: ${err.message}`
    );
  }
}

module.exports = { getForecast };
