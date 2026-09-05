const express = require("express");
const reviewController = require("../controllers/reviewController");

const router = express.Router();

router.post("/create", reviewController.createReview);
router.post("/submit", reviewController.submitReview);
router.get("/status/:id", reviewController.getStatus);

module.exports = router;
