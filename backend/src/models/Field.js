const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Phase 2 §6: Fields { field_id, farmer_id, area, location, soil, current_crop }
const FieldSchema = new mongoose.Schema(
  {
    fieldId: { type: String, default: uuidv4, unique: true, index: true },
    farmerId: { type: String, required: true, index: true },
    area: {
      value: { type: Number },
      unit: { type: String, default: "acre" },
    },
    location: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      label: { type: String },
    },
    soil: {
      type: { type: String }, // e.g. "loamy", "clay"
      ph: { type: Number },
    },
    currentCrop: { type: String },
  },
  { timestamps: true }
);

// Support "find field context by farmer" (Phase 3 §5)
FieldSchema.index({ farmerId: 1, createdAt: -1 });

module.exports = mongoose.model("Field", FieldSchema);
