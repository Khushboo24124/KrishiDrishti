const advisoryService = require("../services/advisoryService");
const asyncHandler = require("../utils/asyncHandler");

const getAdvisory = asyncHandler(async (req, res) => {
  const advisory = await advisoryService.getAdvisory(req.params.id);
  res.status(200).json(advisory);
});

module.exports = { getAdvisory };
