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
}) {
  const nicheEmbedding = await buildNicheEmbedding(nicheText, targetAudience);
  const [result] = await db.query(
    `INSERT INTO campaigns
     (businessId, nicheText, targetAudience, nicheEmbedding, budgetRange, preferredPlatforms, location, campaignGoal)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      businessId,
      nicheText,
      targetAudience || null,
      nicheEmbedding,
      budgetRange || null,
      preferredPlatforms || null,
      location || null,
      campaignGoal || null,
    ]
  );

  return result.insertId;
}

async function getCampaignsByBusinessId(businessId) {
  const [rows] = await db.query(
    `SELECT * FROM campaigns
     WHERE businessId = ?
     ORDER BY createdAt DESC`,
    [businessId]
  );

  return rows;
}

async function getCampaignById(campaignId) {
  const [rows] = await db.query(
    `SELECT * FROM campaigns WHERE campaignId = ? LIMIT 1`,
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
}) {
  const nicheEmbedding = await buildNicheEmbedding(nicheText, targetAudience);
  const [result] = await db.query(
    `UPDATE campaigns
     SET nicheText = ?, targetAudience = ?, nicheEmbedding = ?, budgetRange = ?, preferredPlatforms = ?, location = ?, campaignGoal = ?
     WHERE campaignId = ? AND businessId = ?`,
    [
      nicheText,
      targetAudience || null,
      nicheEmbedding,
      budgetRange || null,
      preferredPlatforms || null,
      location || null,
      campaignGoal || null,
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
