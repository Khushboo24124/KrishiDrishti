const express = require("express");
const advisoryController = require("../controllers/advisoryController");

const router = express.Router();

router.get("/:id", advisoryController.getAdvisory);

module.exports = router;
