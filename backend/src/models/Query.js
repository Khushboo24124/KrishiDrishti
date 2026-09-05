const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Phase 2 §6: Queries { query_id, farmer_id, message, timestamp }
// Extended with `type`/`payload` so a query can be traced to the specific
// crop/disease/weather/market request it represents (useful for the
// "recent activity" query need in Phase 3 §5, and for the demo journey).
const QuerySchema = new mongoose.Schema(
  {
    queryId: { type: String, default: uuidv4, unique: true, index: true },
    farmerId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["crop_recommendation", "disease_analysis", "weather", "market"],
      required: true,
    },
    message: { type: String }, // short human-readable summary for the UI
    payload: { type: mongoose.Schema.Types.Mixed }, // the raw request body
    predictionId: { type: String, index: true }, // set for AI-backed queries
  },
  { timestamps: true }
);

QuerySchema.index({ farmerId: 1, createdAt: -1 });

module.exports = mongoose.model("Query", QuerySchema);
