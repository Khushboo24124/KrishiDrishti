// Wraps an async Express handler so a thrown/rejected error is forwarded to
// next() instead of crashing the process or hanging the request.
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
