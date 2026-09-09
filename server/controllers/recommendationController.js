const db = require('../config/db');
const recommendationModel = require('../models/recommendationModel');
const { generateRecommendations } = require('../services/recommendationEngine');

async function findBusinessIdByUserId(userId) {
  const [rows] = await db.query(
    `SELECT businessId FROM businesses WHERE userId = ? LIMIT 1`,
    [userId]
  );

  return rows.length > 0 ? rows[0].businessId : null;
}

async function findOwnedCampaign(campaignId, businessId) {
  const [rows] = await db.query(
    `SELECT * FROM campaigns WHERE campaignId = ? AND businessId = ? LIMIT 1`,
    [campaignId, businessId]
  );

  return rows[0] || null;
}

async function findAllCreatorProfiles() {
  const [rows] = await db.query(
    `SELECT * FROM creator_profiles`
  );

  return rows;
}

async function getOwnedCampaignForRequest(req) {
  const businessId = await findBusinessIdByUserId(req.user.userId);
  if (!businessId) {
    return { error: 'Business not found', status: 404 };
  }

  const campaign = await findOwnedCampaign(req.params.campaignId, businessId);
  if (!campaign) {
    return { error: 'Campaign not found', status: 404 };
  }

  return { campaign };
}

async function generateForCampaign(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const ownedCampaign = await getOwnedCampaignForRequest(req);
    if (ownedCampaign.error) {
      return res.status(ownedCampaign.status).json({ error: ownedCampaign.error });
    }

    const creatorProfiles = await findAllCreatorProfiles();
    let recommendations;

    try {
      recommendations = await generateRecommendations(ownedCampaign.campaign, creatorProfiles);
    } catch (error) {
      console.warn(`Recommendation generation skipped: ${error.message}`);
      return res.status(200).json({ recommendations: [], message: 'No matching creators found' });
    }

    if (recommendations.length === 0) {
      return res.status(200).json({ recommendations: [], message: 'No matching creators found' });
    }

    for (const recommendation of recommendations) {
      await recommendationModel.saveRecommendation(
        req.params.campaignId,
        recommendation.profileId,
        recommendation
      );
    }

    return res.status(200).json(recommendations);
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getForCampaign(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const ownedCampaign = await getOwnedCampaignForRequest(req);
    if (ownedCampaign.error) {
      return res.status(ownedCampaign.status).json({ error: ownedCampaign.error });
    }

    const recommendations = await recommendationModel.getRecommendationsByCampaignId(
      req.params.campaignId
    );

    return res.status(200).json(recommendations);
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  generateForCampaign,
  getForCampaign,
};
