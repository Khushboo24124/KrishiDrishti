const express = require("express");
const marketController = require("../controllers/marketController");

const router = express.Router();

router.get("/prices", marketController.getPrices);

module.exports = router;
