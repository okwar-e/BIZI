const express = require('express');
const {
  createCampaign,
  getMyCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  setCampaignPublication,
} = require('../controllers/campaignController');
const { verifyToken } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/', verifyToken, requireRole('business'), createCampaign);
router.get('/', verifyToken, requireRole('business'), getMyCampaigns);
router.get('/:campaignId', verifyToken, requireRole('business'), getCampaign);
router.put('/:campaignId', verifyToken, requireRole('business'), updateCampaign);
router.delete('/:campaignId', verifyToken, requireRole('business'), deleteCampaign);
router.patch('/:campaignId/publication', verifyToken, requireRole('business'), setCampaignPublication);

module.exports = router;
