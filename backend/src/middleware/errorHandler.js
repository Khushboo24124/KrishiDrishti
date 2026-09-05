const { AppError, DependencyUnavailableError } = require("../utils/errors");

/**
 * True for the errors Mongoose/the MongoDB driver throw when the database
 * itself is the problem (unreachable, buffering-timeout, topology closed) —
 * as opposed to a schema/validation error, which is a genuine client bug.
 */
function isDatabaseUnavailableError(err) {
  const name = err?.name || "";
  const message = err?.message || "";
  return (
    name === "MongooseError" ||
    name === "MongoServerSelectionError" ||
    name === "MongoNetworkError" ||
    name === "MongoTimeoutError" ||
    /buffering timed out/i.test(message)
  );
}

/**
 * The single place that turns a thrown error into an HTTP response.
 * Structured error codes are validation_error | dependency_unavailable |
 * model_unavailable | upload_invalid | not_found (Phase 3 §9). Anything
 * else is logged with its correlation ID and returned as a generic 500 —
 * never leaking stack traces or internals to the client.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let resolvedErr = err;

  if (!(resolvedErr instanceof AppError) && isDatabaseUnavailableError(resolvedErr)) {
    resolvedErr = new DependencyUnavailableError(
      "database",
      "Database is currently unavailable. Nothing was persisted."
    );
  }

  if (resolvedErr instanceof AppError) {
    console.warn(
      `[${req.requestId || "-"}] ${resolvedErr.code} (${resolvedErr.statusCode}): ${resolvedErr.message}`
    );
    return res.status(resolvedErr.statusCode).json(resolvedErr.toJSON());
  }

  // Multer/body-parser and other library errors that aren't AppErrors.
  console.error(`[${req.requestId || "-"}] unhandled error:`, err);
  return res.status(500).json({
    error: "internal_error",
    message: "Something went wrong on our side.",
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: "not_found",
    message: `No route for ${req.method} ${req.originalUrl}`,
  });
}

module.exports = { errorHandler, notFoundHandler };
