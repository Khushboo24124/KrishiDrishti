const express = require("express");
const aiController = require("../controllers/aiController");
const { validateImageUpload } = require("../middleware/upload");

const router = express.Router();

router.post("/recommend/crop", aiController.recommendCrop);
router.post("/analyze/disease", validateImageUpload, aiController.analyzeDisease);

module.exports = router;
