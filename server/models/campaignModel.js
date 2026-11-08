const db = require('../config/db');
const { getEmbedding } = require('../services/embeddingService');

async function buildNicheEmbedding(nicheText, targetAudience) {
  const embeddingText = [nicheText, targetAudience]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ');

  try {
    return JSON.stringify(await getEmbedding(embeddingText));
  } catch (error) {
    console.warn(`Campaign embedding skipped: ${error.message}`);
    return null;
  }
}

async function createCampaign(businessId, {
  nicheText,
  targetAudience,
  budgetRange,
  preferredPlatforms,
  location,
  campaignGoal,
  totalBudget = 0,
  currency = 'KES',
  targetCreatorCount = 1,
}, options = {}) {
  const nicheEmbedding = await (options.buildEmbedding || buildNicheEmbedding)(nicheText, targetAudience);
  const query = options.query || db.query.bind(db);
  const [result] = await query(
    `INSERT INTO campaigns
     (businessId, nicheText, targetAudience, nicheEmbedding, budgetRange, preferredPlatforms, location, campaignGoal,
      totalBudget, currency, targetCreatorCount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      businessId,
      nicheText,
      targetAudience || null,
      nicheEmbedding,
      budgetRange || null,
      preferredPlatforms || null,
      location || null,
      campaignGoal || null,
      totalBudget,
      currency,
      targetCreatorCount,
    ]
  );

  return result.insertId;
}

async function getCampaignsByBusinessId(businessId) {
  const [rows] = await db.query(
    `SELECT c.*,
       COALESCE((SELECT SUM(i.offeredAmount) FROM campaign_invitations i
         WHERE i.campaignId = c.campaignId AND (i.status = 'accepted' OR
           (i.status = 'pending' AND (i.expiresAt IS NULL OR i.expiresAt > CURRENT_TIMESTAMP)))), 0) AS allocatedBudget,
       (SELECT COUNT(DISTINCT i.creatorId) FROM campaign_invitations i
         WHERE i.campaignId = c.campaignId AND i.status = 'accepted') +
       (SELECT COUNT(DISTINCT a.creatorId) FROM campaign_applications a
         WHERE a.campaignId = c.campaignId AND a.status = 'accepted'
           AND NOT EXISTS (SELECT 1 FROM campaign_invitations i
             WHERE i.campaignId = a.campaignId AND i.creatorId = a.creatorId AND i.status = 'accepted')) AS filledCreatorSlots
     FROM campaigns c
     WHERE businessId = ?
     ORDER BY createdAt DESC`,
    [businessId]
  );

  return rows;
}

async function getCampaignById(campaignId) {
  const [rows] = await db.query(
    `SELECT c.*,
       COALESCE((SELECT SUM(i.offeredAmount) FROM campaign_invitations i
         WHERE i.campaignId = c.campaignId AND (i.status = 'accepted' OR
           (i.status = 'pending' AND (i.expiresAt IS NULL OR i.expiresAt > CURRENT_TIMESTAMP)))), 0) AS allocatedBudget,
       (SELECT COUNT(DISTINCT i.creatorId) FROM campaign_invitations i
         WHERE i.campaignId = c.campaignId AND i.status = 'accepted') +
       (SELECT COUNT(DISTINCT a.creatorId) FROM campaign_applications a
         WHERE a.campaignId = c.campaignId AND a.status = 'accepted'
           AND NOT EXISTS (SELECT 1 FROM campaign_invitations i
             WHERE i.campaignId = a.campaignId AND i.creatorId = a.creatorId AND i.status = 'accepted')) AS filledCreatorSlots
     FROM campaigns c WHERE c.campaignId = ? LIMIT 1`,
    [campaignId]
  );

  return rows[0] || null;
}

async function updateCampaign(campaignId, businessId, {
  nicheText,
  targetAudience,
  budgetRange,
  preferredPlatforms,
  location,
  campaignGoal,
  totalBudget = 0,
  currency = 'KES',
  targetCreatorCount = 1,
}, options = {}) {
  const nicheEmbedding = await (options.buildEmbedding || buildNicheEmbedding)(nicheText, targetAudience);
  const query = options.query || db.query.bind(db);
  const [result] = await query(
    `UPDATE campaigns
     SET nicheText = ?, targetAudience = ?, nicheEmbedding = ?, budgetRange = ?, preferredPlatforms = ?, location = ?, campaignGoal = ?,
       totalBudget = ?, currency = ?, targetCreatorCount = ?
     WHERE campaignId = ? AND businessId = ?`,
    [
      nicheText,
      targetAudience || null,
      nicheEmbedding,
      budgetRange || null,
      preferredPlatforms || null,
      location || null,
      campaignGoal || null,
      totalBudget,
      currency,
      targetCreatorCount,
      campaignId,
      businessId,
    ]
  );

  return result.affectedRows;
}

async function deleteCampaign(campaignId, businessId) {
  const [result] = await db.query(
    `DELETE FROM campaigns WHERE campaignId = ? AND businessId = ?`,
    [campaignId, businessId]
  );

  return result.affectedRows;
}

module.exports = {
  createCampaign,
  getCampaignsByBusinessId,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
};
