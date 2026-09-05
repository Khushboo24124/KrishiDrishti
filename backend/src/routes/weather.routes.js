const express = require("express");
const weatherController = require("../controllers/weatherController");

const router = express.Router();

router.get("/forecast", weatherController.getForecast);

module.exports = router;
