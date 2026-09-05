const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Phase 2 §6: ModelOutputs { prediction_id, prediction, confidence, model,
//                            verification_state, timestamp }
//
// The AI service (API_CONTRACT.md) never assigns predictionId and never
// persists anything — that's this collection's job (Phase 3 §4). We store
// the AI service's response close to verbatim (`raw`) for auditability,
// plus the fields the rest of the app queries on directly.
const ModelOutputSchema = new mongoose.Schema(
  {
    predictionId: { type: String, default: uuidv4, unique: true, index: true },

    type: {
      type: String,
      enum: ["crop_recommendation", "disease_analysis"],
      required: true,
    },

    farmerId: { type: String, index: true },
    fieldId: { type: String },

    // Normalized "what was predicted" — recommendedCrop for crop calls,
    // { disease, crop } for disease calls. Kept separate from `raw` so the
    // rest of the backend doesn't need to know the AI contract's field names.
    prediction: {
      recommendedCrop: { type: String, default: null },
      disease: { type: String, default: null },
      crop: { type: String, default: null },
    },

    confidence: { type: Number },
    margin: { type: Number },
    model: { type: String }, // modelVersion from the AI service
    reason: { type: String }, // AI service's stable reason code

    // verification_state starts as whatever the AI service returned
    // (routingStatus) and can only move forward through the review
    // workflow (e.g. REVIEW_REQUIRED -> EXPERT_REQUIRED on disagreement).
    // It is never downgraded from EXPERT_REQUIRED back to HIGH_CONFIDENCE
    // by this service.
    verificationState: {
      type: String,
      enum: [
        "HIGH_CONFIDENCE",
        "REVIEW_REQUIRED",
        "ADDITIONAL_INPUT_REQUIRED",
        "EXPERT_REQUIRED",
      ],
      required: true,
      index: true,
    },

    // The AI service's response, stored verbatim for audit/debugging.
    // Never used as the source of truth for routing decisions after the
    // review workflow has moved verificationState forward.
    raw: { type: mongoose.Schema.Types.Mixed },

    // True only if this row represents a real, live AI-service response.
    // Nothing in this collection is ever written from a fabricated/demo
    // value in the production path (Phase 3 §3, Team Execution §9).
    isLiveInference: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ModelOutputSchema.index({ verificationState: 1, createdAt: -1 });

module.exports = mongoose.model("ModelOutput", ModelOutputSchema);
