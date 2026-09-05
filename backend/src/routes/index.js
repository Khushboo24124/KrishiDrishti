const express = require("express");

const router = express.Router();

router.use("/health", require("./health.routes"));
router.use("/ai", require("./ai.routes"));
router.use("/weather", require("./weather.routes"));
router.use("/market", require("./market.routes"));
router.use("/review", require("./review.routes"));
router.use("/advisory", require("./advisory.routes"));
router.use("/farmers", require("./farmer.routes"));

module.exports = router;
