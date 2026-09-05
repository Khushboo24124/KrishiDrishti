const reviewService = require("../services/reviewService");
const asyncHandler = require("../utils/asyncHandler");
const { ValidationError } = require("../utils/errors");

const createReview = asyncHandler(async (req, res) => {
  const { predictionId } = req.body;
  if (!predictionId) throw new ValidationError(["predictionId is required"]);

  const verification = await reviewService.createReviewCase(predictionId);
  res.status(201).json(verification);
});

const submitReview = asyncHandler(async (req, res) => {
  const { predictionId, reviewerId, decision, reputation } = req.body;
  if (!predictionId) throw new ValidationError(["predictionId is required"]);
  if (!reviewerId) throw new ValidationError(["reviewerId is required"]);
  if (!decision) throw new ValidationError(["decision is required"]);

  const verification = await reviewService.submitReview(
    predictionId,
    reviewerId,
    decision,
    reputation
  );
  res.status(200).json(verification);
});

const getStatus = asyncHandler(async (req, res) => {
  const verification = await reviewService.getReviewStatus(req.params.id);
  res.status(200).json(verification);
});

module.exports = { createReview, submitReview, getStatus };
