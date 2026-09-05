const { dbStatus } = require("../config/db");
const aiClient = require("../services/aiClient");
const asyncHandler = require("../utils/asyncHandler");

const getHealth = asyncHandler(async (req, res) => {
  const db = dbStatus();
  const ai = await aiClient.checkHealth();

  const aiOk = ai.status === "ok";
  const overallStatus = db.connected && aiOk ? "ok" : "degraded";

  res.status(200).json({
    status: overallStatus,
    database: db,
    aiService: ai,
    timestamp: new Date().toISOString(),
  });
});

module.exports = { getHealth };
