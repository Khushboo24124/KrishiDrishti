const express = require("express");
const farmerController = require("../controllers/farmerController");

const router = express.Router();

router.post("/", farmerController.createFarmer);
router.get("/:id", farmerController.getFarmer);
router.post("/:id/fields", (req, res, next) => {
  req.body.farmerId = req.params.id;
  next();
}, farmerController.createField);
router.get("/:id/fields", farmerController.listFieldsForFarmer);

module.exports = router;
