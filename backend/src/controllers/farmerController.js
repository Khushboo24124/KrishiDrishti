const Farmer = require("../models/Farmer");
const Field = require("../models/Field");
const asyncHandler = require("../utils/asyncHandler");
const { hashIdentifier } = require("../utils/hash");
const { NotFoundError, ValidationError } = require("../utils/errors");

// These endpoints aren't in Phase 2's baseline contract table, but the
// Phase 2 data model requires persisted Farmers/Fields, and the crop/disease
// endpoints accept an optional farmerId/fieldId. Documented as backend
// additions in API_CONTRACT.md.

const createFarmer = asyncHandler(async (req, res) => {
  const { language, location, phone } = req.body;
  const farmer = await Farmer.create({
    language,
    location,
    phoneHash: phone ? hashIdentifier(phone) : undefined,
  });
  res.status(201).json(farmer);
});

const getFarmer = asyncHandler(async (req, res) => {
  const farmer = await Farmer.findOne({ farmerId: req.params.id }).lean();
  if (!farmer) throw new NotFoundError("Farmer", req.params.id);
  res.status(200).json(farmer);
});

const createField = asyncHandler(async (req, res) => {
  const { farmerId, area, location, soil, currentCrop } = req.body;
  if (!farmerId) throw new ValidationError(["farmerId is required"]);

  const farmer = await Farmer.findOne({ farmerId });
  if (!farmer) throw new NotFoundError("Farmer", farmerId);

  const field = await Field.create({ farmerId, area, location, soil, currentCrop });
  res.status(201).json(field);
});

const listFieldsForFarmer = asyncHandler(async (req, res) => {
  const fields = await Field.find({ farmerId: req.params.id }).sort({ createdAt: -1 }).lean();
  res.status(200).json(fields);
});

module.exports = { createFarmer, getFarmer, createField, listFieldsForFarmer };
