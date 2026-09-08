const db = require('../config/db');

async function createOrUpdateProfile(creatorId, { niche, audienceDescription, platforms, location }) {
  const [rows] = await db.query(
    `SELECT profileId FROM creator_profiles WHERE creatorId = ? LIMIT 1`,
    [creatorId]
  );

  if (rows.length > 0) {
    const { profileId } = rows[0];

    await db.query(
      `UPDATE creator_profiles
       SET niche = ?, audienceDescription = ?, platforms = ?, location = ?
       WHERE profileId = ?`,
      [niche, audienceDescription, platforms || null, location || null, profileId]
    );

    return profileId;
  }

  const [result] = await db.query(
    `INSERT INTO creator_profiles (creatorId, niche, audienceDescription, platforms, location)
     VALUES (?, ?, ?, ?, ?)`,
    [creatorId, niche, audienceDescription, platforms || null, location || null]
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
