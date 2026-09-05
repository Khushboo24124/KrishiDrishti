const aiClient = require("../services/aiClient");
const reviewService = require("../services/reviewService");
const ModelOutput = require("../models/ModelOutput");
const Query = require("../models/Query");
const asyncHandler = require("../utils/asyncHandler");
const { validateCropInput } = require("../utils/validators");

/**
 * Persists the AI service's raw response as a ModelOutput. The backend
 * (this service) owns predictionId — the AI service never assigns one
 * (API_CONTRACT.md). This is called BEFORE any routing/review side-effect,
 * so the raw evidence is on record even if something downstream fails.
 */
async function persistModelOutput({ type, farmerId, fieldId, aiResponse }) {
  return ModelOutput.create({
    type,
    farmerId: farmerId || undefined,
    fieldId: fieldId || undefined,
    prediction: {
      recommendedCrop: aiResponse.recommendedCrop ?? null,
      disease: aiResponse.disease ?? null,
      crop: aiResponse.crop ?? null,
    },
    confidence: aiResponse.confidence,
    margin: aiResponse.margin,
    model: aiResponse.modelVersion,
    reason: aiResponse.reason,
    verificationState: aiResponse.routingStatus,
    raw: aiResponse,
    isLiveInference: true,
  });
}

/** Shapes the API response: our predictionId + the AI evidence fields. */
function toResponseBody(modelOutput) {
  return {
    predictionId: modelOutput.predictionId,
    recommendedCrop: modelOutput.prediction.recommendedCrop,
    disease: modelOutput.prediction.disease,
    crop: modelOutput.prediction.crop,
    confidence: modelOutput.confidence,
    margin: modelOutput.margin,
    modelVersion: modelOutput.model,
    routingStatus: modelOutput.verificationState,
    reason: modelOutput.reason,
    message: modelOutput.raw?.message,
    evidence: modelOutput.raw?.evidence,
  };
}

const recommendCrop = asyncHandler(async (req, res) => {
  const input = validateCropInput(req.body);
  const { farmerId, fieldId } = req.body;

  // Calls the live AI service — no mocked/fabricated predictions in this
  // path (Phase 3 §3, Team Execution §9). Any failure here throws a
  // structured error (model_unavailable / dependency_unavailable /
  // validation_error) and nothing is persisted as a fake result.
  const aiResponse = await aiClient.recommendCrop(input);

  const modelOutput = await persistModelOutput({
    type: "crop_recommendation",
    farmerId,
    fieldId,
    aiResponse,
  });

  if (farmerId) {
    await Query.create({
      farmerId,
      type: "crop_recommendation",
      message: `Crop recommendation requested (${aiResponse.routingStatus})`,
      payload: input,
      predictionId: modelOutput.predictionId,
    });
  }

  if (modelOutput.verificationState === "REVIEW_REQUIRED") {
    await reviewService.createReviewCase(modelOutput.predictionId);
  }

  res.status(200).json(toResponseBody(modelOutput));
});

const analyzeDisease = asyncHandler(async (req, res) => {
  const { farmerId, fieldId } = req.body;
  const { buffer, originalname, detectedMimeType } = req.file;

  const aiResponse = await aiClient.analyzeDisease(buffer, originalname, detectedMimeType);

  const modelOutput = await persistModelOutput({
    type: "disease_analysis",
    farmerId,
    fieldId,
    aiResponse,
  });

  if (farmerId) {
    await Query.create({
      farmerId,
      type: "disease_analysis",
      message: `Disease analysis requested (${aiResponse.routingStatus})`,
      payload: { filename: originalname, contentType: detectedMimeType },
      predictionId: modelOutput.predictionId,
    });
  }

  if (modelOutput.verificationState === "REVIEW_REQUIRED") {
    await reviewService.createReviewCase(modelOutput.predictionId);
  }

  res.status(200).json(toResponseBody(modelOutput));
});

module.exports = { recommendCrop, analyzeDisease };
