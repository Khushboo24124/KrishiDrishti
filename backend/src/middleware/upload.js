const multer = require("multer");
const env = require("../config/env");
const { UploadInvalidError } = require("../utils/errors");

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Memory storage: we forward the buffer straight to the AI service, we
// never write farmer-uploaded images to disk on this service.
const storage = multer.memoryStorage();

const multerUpload = multer({
  storage,
  limits: { fileSize: env.maxImageUploadBytes, files: 1 },
}).single("image");

/**
 * Wraps multer, then re-checks the file's real content type by sniffing its
 * magic bytes — per Phase 3 §9: "never trust a browser-provided MIME type
 * alone." A file that claims to be a JPEG but isn't is rejected here before
 * it ever reaches the AI service.
 */
function validateImageUpload(req, res, next) {
  multerUpload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          new UploadInvalidError(
            `Image exceeds the ${Math.round(
              env.maxImageUploadBytes / (1024 * 1024)
            )}MB limit.`
          )
        );
      }
      return next(new UploadInvalidError(err.message));
    }
    if (err) return next(err);

    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return next(new UploadInvalidError("No image file was provided (field name: image)."));
    }

    try {
      const { fromBuffer } = require("file-type");
      const detected = await fromBuffer(req.file.buffer);

      if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        return next(
          new UploadInvalidError(
            "Unsupported or unrecognized image format. Use JPEG, PNG, or WebP.",
            { declaredMimeType: req.file.mimetype, detectedMimeType: detected?.mime || null }
          )
        );
      }

      // Overwrite whatever the browser claimed with what we actually detected.
      req.file.detectedMimeType = detected.mime;
      req.file.detectedExt = detected.ext;
      next();
    } catch (sniffErr) {
      next(new UploadInvalidError("Could not read the uploaded file.", sniffErr.message));
    }
  });
}

module.exports = { validateImageUpload };
