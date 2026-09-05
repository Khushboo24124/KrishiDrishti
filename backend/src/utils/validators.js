const { ValidationError } = require("./errors");

// Plausible ranges — a first line of defense before the request ever
// reaches the AI service, which does its own authoritative validation
// (API_CONTRACT.md: 400 validation_error). Kept intentionally loose; the
// AI service is the source of truth for what's actually trainable-range.
const CROP_FIELD_RANGES = {
  nitrogen: [0, 300],
  phosphorus: [0, 300],
  potassium: [0, 300],
  temperature: [-10, 60],
  humidity: [0, 100],
  ph: [0, 14],
  rainfall: [0, 5000],
};

function validateCropInput(body) {
  const details = [];
  for (const field of Object.keys(CROP_FIELD_RANGES)) {
    const value = body[field];
    if (value === undefined || value === null || value === "") {
      details.push(`${field} is required`);
      continue;
    }
    const num = Number(value);
    if (Number.isNaN(num)) {
      details.push(`${field} must be numeric (got "${value}")`);
      continue;
    }
    const [min, max] = CROP_FIELD_RANGES[field];
    if (num < min || num > max) {
      details.push(`${field}=${num} is outside the plausible range [${min}, ${max}]`);
    }
  }

  if (body.location !== undefined) {
    const { latitude, longitude } = body.location || {};
    if (
      (latitude !== undefined && typeof latitude !== "number") ||
      (longitude !== undefined && typeof longitude !== "number")
    ) {
      details.push("location.latitude/location.longitude must be numeric if provided");
    }
  }

  if (details.length > 0) {
    throw new ValidationError(details);
  }

  return {
    nitrogen: Number(body.nitrogen),
    phosphorus: Number(body.phosphorus),
    potassium: Number(body.potassium),
    temperature: Number(body.temperature),
    humidity: Number(body.humidity),
    ph: Number(body.ph),
    rainfall: Number(body.rainfall),
    ...(body.location ? { location: body.location } : {}),
  };
}

module.exports = { validateCropInput };
