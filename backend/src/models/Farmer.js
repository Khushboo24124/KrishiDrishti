const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Phase 2 §6: Farmers { farmer_id, language, location, phone_hash }
const FarmerSchema = new mongoose.Schema(
  {
    farmerId: { type: String, default: uuidv4, unique: true, index: true },
    language: { type: String, default: "en" },
    location: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      label: { type: String }, // e.g. district/village name, optional
    },
    // Never store a raw phone number — only its hash (see utils/hash.js).
    phoneHash: { type: String, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Farmer", FarmerSchema);
