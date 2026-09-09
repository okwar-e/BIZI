const db = require('../config/db');

async function saveRecommendation(campaignId, profileId, {
  semanticScore,
  ruleScore,
  finalScore,
  explanationText,
}) {
  const [result] = await db.query(
    `INSERT INTO recommendations
     (campaignId, profileId, semanticScore, ruleScore, finalScore, explanationText)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [campaignId, profileId, semanticScore, ruleScore, finalScore, explanationText || null]
  );

  return result.insertId;
}

async function getRecommendationsByCampaignId(campaignId) {
  const [rows] = await db.query(
    `SELECT
       r.recommendationId,
       r.campaignId,
       r.profileId,
       r.semanticScore,
       r.ruleScore,
       r.finalScore,
       r.explanationText,
       r.createdAt,
       cp.niche,
       cp.platforms,
       cp.location,
       c.publicHandle
     FROM recommendations r
     JOIN creator_profiles cp ON cp.profileId = r.profileId
     JOIN creators c ON c.creatorId = cp.creatorId
     WHERE r.campaignId = ?
     ORDER BY r.finalScore DESC`,
    [campaignId]
  );

  return rows;
}

module.exports = {
  saveRecommendation,
  getRecommendationsByCampaignId,
};
