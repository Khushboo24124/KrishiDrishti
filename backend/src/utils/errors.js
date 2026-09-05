// Structured errors, per Phase 3 §9 / Phase 2 §8:
//   validation_error | dependency_unavailable | model_unavailable |
//   upload_invalid | not_found
//
// Every thrown error in this app should be one of these (or a plain Error,
// which the global handler treats as an unexpected 500). Controllers throw;
// they never build ad-hoc { error: ... } bodies themselves.

class AppError extends Error {
  constructor(code, message, statusCode, details) {
    super(message || code);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    const body = { error: this.code, message: this.message };
    if (this.details !== undefined) body.details = this.details;
    return body;
  }
}

class ValidationError extends AppError {
  constructor(details, message = "Request failed validation.") {
    super("validation_error", message, 400, details);
  }
}

class UploadInvalidError extends AppError {
  constructor(message, details) {
    super("upload_invalid", message || "Uploaded file is invalid.", 400, details);
  }
}

class DependencyUnavailableError extends AppError {
  constructor(dependency, message) {
    super(
      "dependency_unavailable",
      message || `${dependency} is currently unavailable.`,
      503,
      { dependency }
    );
  }
}

class ModelUnavailableError extends AppError {
  constructor(message, details) {
    super("model_unavailable", message || "AI model is not available.", 503, details);
  }
}

class NotFoundError extends AppError {
  constructor(resource, id) {
    super("not_found", `${resource} not found${id ? `: ${id}` : ""}.`, 404, {
      resource,
      id,
    });
  }
}

module.exports = {
  AppError,
  ValidationError,
  UploadInvalidError,
  DependencyUnavailableError,
  ModelUnavailableError,
  NotFoundError,
};
