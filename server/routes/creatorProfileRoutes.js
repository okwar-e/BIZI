const express = require('express');
const {
  upsertProfile,
  getMyProfile,
  updateSelfReportedMetrics,
} = require('../controllers/creatorProfileController');
const { verifyToken } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

router.put('/', verifyToken, requireRole('creator'), upsertProfile);
router.get('/me', verifyToken, requireRole('creator'), getMyProfile);
router.put('/metrics', verifyToken, requireRole('creator'), updateSelfReportedMetrics);

module.exports = router;
