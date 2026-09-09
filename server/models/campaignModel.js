const db = require('../config/db');

async function createCampaign(businessId, {
  nicheText,
  targetAudience,
  budgetRange,
  preferredPlatforms,
  location,
  campaignGoal,
}) {
  const [result] = await db.query(
    `INSERT INTO campaigns
     (businessId, nicheText, targetAudience, budgetRange, preferredPlatforms, location, campaignGoal)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      businessId,
      nicheText,
      targetAudience || null,
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
  const [result] = await db.query(
    `UPDATE campaigns
     SET nicheText = ?, targetAudience = ?, budgetRange = ?, preferredPlatforms = ?, location = ?, campaignGoal = ?
     WHERE campaignId = ? AND businessId = ?`,
    [
      nicheText,
      targetAudience || null,
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
