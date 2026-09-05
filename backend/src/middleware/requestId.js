const { v4: uuidv4 } = require("uuid");

// Per Phase 3 §9: "Log correlation/prediction IDs ... without leaking
// credentials or sensitive content." Every request gets a correlation ID,
// echoed back in the response header and available to controllers/logs.
function requestId(req, res, next) {
  const incoming = req.headers["x-request-id"];
  req.requestId = typeof incoming === "string" && incoming.length <= 128 ? incoming : uuidv4();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

module.exports = requestId;
