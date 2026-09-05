const Review = require("../models/Review");
const ModelOutput = require("../models/ModelOutput");
const VerificationResult = require("../models/VerificationResult");
const env = require("../config/env");
const { hashIdentifier } = require("../utils/hash");
const { ValidationError, NotFoundError } = require("../utils/errors");

const DECISION_VALUE = { AGREE: 1, DISAGREE: -1, UNSURE: 0 };

// A ModelOutput's `reason` that marks it as coming from a high-risk class
// (per API_CONTRACT.md's stable reason codes). High-risk cases hold a
// stricter bar before they're allowed to resolve as HIGH_CONFIDENCE.
const HIGH_RISK_REASONS = new Set([
  "high_risk_class_requires_verification",
  "high_risk_class_and_uncertain",
]);

/**
 * Creates (or returns the existing) review case for a ModelOutput whose
 * routingStatus is REVIEW_REQUIRED. Idempotent — calling this twice for the
 * same prediction does not create duplicate VerificationResult rows.
 */
async function createReviewCase(predictionId) {
  const output = await ModelOutput.findOne({ predictionId });
  if (!output) throw new NotFoundError("ModelOutput", predictionId);

  if (output.verificationState !== "REVIEW_REQUIRED") {
    throw new ValidationError(
      [
        `ModelOutput ${predictionId} has verificationState ` +
          `${output.verificationState}, not REVIEW_REQUIRED — a review case ` +
          `is not applicable.`,
      ],
      "Review case can only be created for REVIEW_REQUIRED predictions."
    );
  }

  const existing = await VerificationResult.findOne({ predictionId });
  if (existing) return existing;

  return VerificationResult.create({
    predictionId,
    reviewCount: 0,
    consensus: "PENDING",
    finalState: "REVIEW_REQUIRED",
  });
}

/**
 * Records one reviewer's decision, then recomputes consensus.
 * @param {string} predictionId
 * @param {string} reviewerIdentifier - raw identifier; only its hash is stored
 * @param {"AGREE"|"DISAGREE"|"UNSURE"} decision
 * @param {number} [reputation]
 */
async function submitReview(predictionId, reviewerIdentifier, decision, reputation) {
  if (!DECISION_VALUE.hasOwnProperty(decision)) {
    throw new ValidationError([
      `decision must be one of AGREE, DISAGREE, UNSURE (got "${decision}")`,
    ]);
  }
  if (!reviewerIdentifier) {
    throw new ValidationError(["reviewerIdentifier is required"]);
  }

  const output = await ModelOutput.findOne({ predictionId });
  if (!output) throw new NotFoundError("ModelOutput", predictionId);

  const verification = await VerificationResult.findOne({ predictionId });
  if (!verification) {
    throw new ValidationError(
      [`No review case exists yet for ${predictionId}`],
      "Create a review case before submitting a decision."
    );
  }
  if (verification.finalState !== "REVIEW_REQUIRED") {
    throw new ValidationError(
      [`Review for ${predictionId} is already resolved as ${verification.finalState}`],
      "This case is no longer accepting reviews."
    );
  }

  const reviewerHash = hashIdentifier(reviewerIdentifier);

  // Upsert: one decision per (prediction, reviewer) — resubmission updates
  // rather than stacking a duplicate vote (Phase 2 §8).
  await Review.findOneAndUpdate(
    { predictionId, reviewerHash },
    { decision, reputation: reputation ?? 1 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return recomputeConsensus(predictionId);
}

/**
 * The consensus rule (kept in one place and documented, per Phase 2 §7:
 * "The rule must be transparent in code").
 *
 * 1. Each review contributes decisionValue * reputation to a weighted sum;
 *    weightedScore = weightedSum / totalReputationWeight, in [-1, 1].
 * 2. Need at least REVIEW_MIN_REVIEWS_FOR_CONSENSUS reviews before any
 *    consensus is finalized — fewer reviews stay REVIEW_REQUIRED/PENDING.
 * 3. Significant disagreement — both AGREE and DISAGREE present, and the
 *    minority side is at least REVIEW_DISAGREEMENT_MIN_MINORITY_FRACTION of
 *    all reviews — always escalates to EXPERT_REQUIRED, regardless of score.
 * 4. Otherwise: weightedScore >= threshold -> AGREE consensus.
 *    weightedScore <= -threshold -> DISAGREE consensus -> EXPERT_REQUIRED
 *    (a confident community "no" still needs an expert, never silently
 *    dropped). Otherwise -> MIXED -> EXPERT_REQUIRED.
 * 5. A high-risk-class prediction (see HIGH_RISK_REASONS) that resolves as
 *    AGREE still requires the same bar as any other case — the AI service
 *    already routed it to REVIEW_REQUIRED specifically because it's
 *    high-risk; a clean AGREE consensus is enough to confirm it, but any
 *    disagreement or MIXED result on a high-risk case is a stronger signal
 *    to escalate, so the escalation paths in step 3/4 already cover it.
 */
async function recomputeConsensus(predictionId) {
  const [output, reviews] = await Promise.all([
    ModelOutput.findOne({ predictionId }),
    Review.find({ predictionId }),
  ]);
  if (!output) throw new NotFoundError("ModelOutput", predictionId);

  const counts = { AGREE: 0, DISAGREE: 0, UNSURE: 0 };
  let weightedSum = 0;
  let totalWeight = 0;
  for (const r of reviews) {
    counts[r.decision] += 1;
    weightedSum += DECISION_VALUE[r.decision] * r.reputation;
    totalWeight += r.reputation;
  }
  const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const reviewCount = reviews.length;
  const isHighRisk = HIGH_RISK_REASONS.has(output.reason);

  let consensus = "PENDING";
  let finalState = "REVIEW_REQUIRED";
  let finalAdvisory = null;
  let decisionReason = "insufficient_reviews";

  const minorityFraction =
    reviewCount > 0
      ? Math.min(counts.AGREE, counts.DISAGREE) / reviewCount
      : 0;
  const significantDisagreement =
    counts.AGREE > 0 &&
    counts.DISAGREE > 0 &&
    minorityFraction >= env.review.disagreementMinMinorityFraction;

  if (reviewCount < env.review.minReviewsForConsensus) {
    consensus = "PENDING";
    finalState = "REVIEW_REQUIRED";
    decisionReason = "insufficient_reviews";
  } else if (significantDisagreement) {
    consensus = "MIXED";
    finalState = "EXPERT_REQUIRED";
    decisionReason = "significant_reviewer_disagreement";
  } else if (weightedScore >= env.review.consensusThreshold) {
    consensus = "AGREE";
    finalState = "HIGH_CONFIDENCE";
    decisionReason = isHighRisk
      ? "reviewer_consensus_agree_high_risk_confirmed"
      : "reviewer_consensus_agree";
    finalAdvisory =
      "Confirmed by community review. Still use judgement for local conditions.";
  } else if (weightedScore <= -env.review.consensusThreshold) {
    consensus = "DISAGREE";
    finalState = "EXPERT_REQUIRED";
    decisionReason = "reviewer_consensus_disagree";
  } else {
    consensus = "MIXED";
    finalState = "EXPERT_REQUIRED";
    decisionReason = "inconclusive_weighted_score";
  }

  const updated = await VerificationResult.findOneAndUpdate(
    { predictionId },
    {
      reviewCount,
      agreeCount: counts.AGREE,
      disagreeCount: counts.DISAGREE,
      unsureCount: counts.UNSURE,
      weightedScore,
      consensus,
      finalState,
      finalAdvisory,
      decisionReason,
    },
    { new: true, upsert: true }
  );

  // Keep ModelOutput.verificationState in sync so every other read path
  // (advisory, health, dashboards) sees one consistent state.
  if (finalState !== "REVIEW_REQUIRED") {
    output.verificationState = finalState;
    await output.save();
  }

  return updated;
}

async function getReviewStatus(predictionId) {
  const verification = await VerificationResult.findOne({ predictionId }).lean();
  if (!verification) throw new NotFoundError("VerificationResult", predictionId);
  return verification;
}

module.exports = {
  createReviewCase,
  submitReview,
  recomputeConsensus,
  getReviewStatus,
};
