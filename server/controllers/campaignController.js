const db = require('../config/db');
const campaignModel = require('../models/campaignModel');

async function findBusinessIdByUserId(userId) {
  const [rows] = await db.query(
    `SELECT businessId FROM businesses WHERE userId = ? LIMIT 1`,
    [userId]
  );

  return rows.length > 0 ? rows[0].businessId : null;
}

function hasRequiredNicheText(nicheText) {
  return typeof nicheText === 'string' && nicheText.trim().length > 0;
}

function getCampaignFields(body) {
  const {
    nicheText,
    targetAudience,
    budgetRange,
    preferredPlatforms,
    location,
    campaignGoal,
  } = body;

  return {
    nicheText,
    targetAudience,
    budgetRange,
    preferredPlatforms,
    location,
    campaignGoal,
  };
}

async function createCampaign(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const fields = getCampaignFields(req.body);
  if (!hasRequiredNicheText(fields.nicheText)) {
    return res.status(400).json({ error: 'nicheText is required' });
  }

  try {
    const businessId = await findBusinessIdByUserId(req.user.userId);
    if (!businessId) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const campaignId = await campaignModel.createCampaign(businessId, fields);
    return res.status(201).json({ campaignId });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getMyCampaigns(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const businessId = await findBusinessIdByUserId(req.user.userId);
    if (!businessId) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const campaigns = await campaignModel.getCampaignsByBusinessId(businessId);
    return res.status(200).json(campaigns);
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getCampaign(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const businessId = await findBusinessIdByUserId(req.user.userId);
    if (!businessId) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const campaign = await campaignModel.getCampaignById(req.params.campaignId);
    if (!campaign || campaign.businessId !== businessId) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    return res.status(200).json(campaign);
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateCampaign(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const fields = getCampaignFields(req.body);
  if (!hasRequiredNicheText(fields.nicheText)) {
    return res.status(400).json({ error: 'nicheText is required' });
  }

  try {
    const businessId = await findBusinessIdByUserId(req.user.userId);
    if (!businessId) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const affectedRows = await campaignModel.updateCampaign(
      req.params.campaignId,
      businessId,
      fields
    );

    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    return res.status(200).json({ message: 'Campaign updated' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deleteCampaign(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const businessId = await findBusinessIdByUserId(req.user.userId);
    if (!businessId) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const affectedRows = await campaignModel.deleteCampaign(
      req.params.campaignId,
      businessId
    );

    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    return res.status(200).json({ message: 'Campaign deleted' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  createCampaign,
  getMyCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
};
