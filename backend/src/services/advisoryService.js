const ModelOutput = require("../models/ModelOutput");
const VerificationResult = require("../models/VerificationResult");
const { NotFoundError } = require("../utils/errors");

/**
 * Human-readable, honesty-first message per routing state. Mirrors the AI
 * service's own `message` field for HIGH_CONFIDENCE/ADDITIONAL_INPUT, but is
 * the backend's own copy once a review/consensus has moved the state along
 * (Phase 1 §7 / Phase 3 §7 — never present an uncertain result as confirmed).
 */
function messageForState(state) {
  switch (state) {
    case "HIGH_CONFIDENCE":
      return "Likely result. Confirm against local conditions before acting.";
    case "REVIEW_REQUIRED":
      return "Under verification. This result is not confirmed yet.";
    case "ADDITIONAL_INPUT_REQUIRED":
      return "We need clearer input before we can analyse this.";
    case "EXPERT_REQUIRED":
      return "This case needs expert review. We are not providing a definitive result yet.";
    default:
      return "Status unavailable.";
    }
}

/**
 * GET /api/v1/advisory/:predictionId
 * Combines the stored ModelOutput with any VerificationResult into one
 * farmer-facing view. Never fabricates a result: if verification is still
 * pending, that's exactly what's returned.
 */
async function getAdvisory(predictionId) {
  const output = await ModelOutput.findOne({ predictionId }).lean();
  if (!output) throw new NotFoundError("ModelOutput", predictionId);

  const verification = await VerificationResult.findOne({ predictionId }).lean();

  const currentState = verification ? verification.finalState : output.verificationState;

  return {
    predictionId: output.predictionId,
    type: output.type,
    prediction: output.prediction,
    confidence: output.confidence,
    modelVersion: output.model,
    routingStatus: currentState,
    reason: verification ? verification.decisionReason : output.reason,
    message: verification?.finalAdvisory || messageForState(currentState),
    review: verification
      ? {
          reviewCount: verification.reviewCount,
          consensus: verification.consensus,
        }
      : null,
    createdAt: output.createdAt,
  };
}

module.exports = { getAdvisory, messageForState };
