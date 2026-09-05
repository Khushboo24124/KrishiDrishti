const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Phase 2 §6: Reviews { review_id, prediction_id, reviewer_hash, decision,
//                        reputation, timestamp }
const ReviewSchema = new mongoose.Schema(
  {
    reviewId: { type: String, default: uuidv4, unique: true, index: true },
    predictionId: { type: String, required: true, index: true },

    // Never the reviewer's raw identity — see utils/hash.js.
    reviewerHash: { type: String, required: true },

    decision: {
      type: String,
      enum: ["AGREE", "DISAGREE", "UNSURE"],
      required: true,
    },

    // Reputation weight in [0, +inf), default 1 (neutral). Configurable per
    // reviewer by future admin tooling; not exposed for self-reporting.
    reputation: { type: Number, default: 1, min: 0 },
  },
  { timestamps: true }
);

// One decision per (prediction, reviewer) — resubmission overwrites, it
// doesn't stack duplicate votes (Phase 2 §8 "Duplicate/invalid decisions").
ReviewSchema.index({ predictionId: 1, reviewerHash: 1 }, { unique: true });

module.exports = mongoose.model("Review", ReviewSchema);
