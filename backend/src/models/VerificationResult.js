const mongoose = require("mongoose");

// Phase 2 §6: VerificationResults { prediction_id, review_count, consensus,
//                                    final_state, final_advisory }
// Phase 3 §5: "one current result per prediction" -> predictionId is unique.
const VerificationResultSchema = new mongoose.Schema(
  {
    predictionId: { type: String, required: true, unique: true, index: true },

    reviewCount: { type: Number, default: 0 },
    agreeCount: { type: Number, default: 0 },
    disagreeCount: { type: Number, default: 0 },
    unsureCount: { type: Number, default: 0 },

    // Weighted score in [-1, 1]; see services/reviewService.js for the rule.
    weightedScore: { type: Number, default: 0 },
    consensus: {
      type: String,
      enum: ["PENDING", "AGREE", "DISAGREE", "MIXED"],
      default: "PENDING",
    },

    finalState: {
      type: String,
      enum: ["REVIEW_REQUIRED", "HIGH_CONFIDENCE", "EXPERT_REQUIRED"],
      default: "REVIEW_REQUIRED",
    },

    finalAdvisory: { type: String, default: null },

    // Which explicit rule produced finalState — kept transparent per
    // Phase 2 §7 ("The rule must be transparent in code").
    decisionReason: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VerificationResult", VerificationResultSchema);
