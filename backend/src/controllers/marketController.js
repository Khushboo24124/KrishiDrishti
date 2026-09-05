const marketClient = require("../services/marketClient");
const asyncHandler = require("../utils/asyncHandler");

const getPrices = asyncHandler(async (req, res) => {
  const { commodity, market, state } = req.query;
  const prices = await marketClient.getPrices({ commodity, market, state });
  res.status(200).json(prices);
});

module.exports = { getPrices };
