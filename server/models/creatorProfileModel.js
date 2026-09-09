const db = require('../config/db');
const { getEmbedding } = require('../services/embeddingService');

async function buildNicheEmbedding(niche, audienceDescription) {
  const embeddingText = [niche, audienceDescription]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ');

  try {
    return JSON.stringify(await getEmbedding(embeddingText));
  } catch (error) {
    console.warn(`Creator profile embedding skipped: ${error.message}`);
    return null;
  }
}

async function createOrUpdateProfile(creatorId, { niche, audienceDescription, platforms, location }) {
  const nicheEmbedding = await buildNicheEmbedding(niche, audienceDescription);
  const [rows] = await db.query(
    `SELECT profileId FROM creator_profiles WHERE creatorId = ? LIMIT 1`,
    [creatorId]
  );

  if (rows.length > 0) {
    const { profileId } = rows[0];

    await db.query(
      `UPDATE creator_profiles
       SET niche = ?, audienceDescription = ?, nicheEmbedding = ?, platforms = ?, location = ?
       WHERE profileId = ?`,
      [
        niche,
        audienceDescription,
        nicheEmbedding,
        platforms || null,
        location || null,
        profileId,
      ]
    );

    return profileId;
  }

  const [result] = await db.query(
    `INSERT INTO creator_profiles
     (creatorId, niche, audienceDescription, nicheEmbedding, platforms, location)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      creatorId,
      niche,
      audienceDescription,
      nicheEmbedding,
      platforms || null,
      location || null,
    ]
  );

  return result.insertId;
}

async function getProfileByCreatorId(creatorId) {
  const [rows] = await db.query(
    `SELECT * FROM creator_profiles WHERE creatorId = ? LIMIT 1`,
    [creatorId]
  );

  return rows[0] || null;
}

async function updateSelfReportedMetrics(creatorId, { selfReportedEngagement, followerCount }) {
  const [result] = await db.query(
    `UPDATE creator_profiles
     SET selfReportedEngagement = ?, followerCount = ?
     WHERE creatorId = ?`,
    [selfReportedEngagement, followerCount, creatorId]
  );

  return result.affectedRows;
}

module.exports = {
  createOrUpdateProfile,
  getProfileByCreatorId,
  updateSelfReportedMetrics,
};
