const express = require('express');
const {
  generateForCampaign,
  getForCampaign,
} = require('../controllers/recommendationController');
const { verifyToken } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/:campaignId/recommendations', verifyToken, requireRole('business'), generateForCampaign);
router.get('/:campaignId/recommendations', verifyToken, requireRole('business'), getForCampaign);

module.exports = router;
