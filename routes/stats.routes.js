const express = require("express");
const router = express.Router();
const { getPlatformStats } = require("../controllers/stats.controller");

router.get("/platform", getPlatformStats);

module.exports = router;
