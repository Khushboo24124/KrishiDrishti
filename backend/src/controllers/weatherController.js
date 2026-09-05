const weatherClient = require("../services/weatherClient");
const asyncHandler = require("../utils/asyncHandler");

const getForecast = asyncHandler(async (req, res) => {
  const latitude = req.query.latitude !== undefined ? Number(req.query.latitude) : undefined;
  const longitude = req.query.longitude !== undefined ? Number(req.query.longitude) : undefined;

  const forecast = await weatherClient.getForecast(latitude, longitude);
  res.status(200).json(forecast);
});

module.exports = { getForecast };
