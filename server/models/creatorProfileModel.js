const db = require('../config/db');
const { getEmbedding } = require('../services/embeddingService');

function booleanValue(value) {
  return value === true || value === 1 || value === '1';
}

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

async function createOrUpdateProfile(creatorId, {
  niche,
  audienceDescription,
  platforms,
  location,
  audienceLocations,
  audienceLocationSource,
  audienceLocationAsOf,
  audienceLocationCoverageComplete,
}) {
  const nicheEmbedding = await buildNicheEmbedding(niche, audienceDescription);
  const [rows] = await db.query(
    `SELECT profileId, audienceLocations, audienceLocationSource, audienceLocationAsOf,
            audienceLocationCoverageComplete
     FROM creator_profiles WHERE creatorId = ? LIMIT 1`,
    [creatorId]
  );

  if (rows.length > 0) {
    const { profileId } = rows[0];
    const old = rows[0];
    const savedAudienceLocations = audienceLocations === undefined
      ? old.audienceLocations
      : typeof audienceLocations === 'string' ? audienceLocations.trim() || null : audienceLocations;
    const audienceLocationsCleared = audienceLocations !== undefined && !savedAudienceLocations;
    const savedAudienceLocationSource = audienceLocationsCleared
      ? null
      : audienceLocationSource === undefined ? old.audienceLocationSource : audienceLocationSource || null;
    const savedAudienceLocationAsOf = audienceLocationsCleared
      ? null
      : audienceLocationAsOf === undefined ? old.audienceLocationAsOf : audienceLocationAsOf || null;
    const savedCoverageComplete = audienceLocationsCleared
      ? false
      : audienceLocationCoverageComplete === undefined
        ? old.audienceLocationCoverageComplete
        : audienceLocationCoverageComplete;

    await db.query(
      `UPDATE creator_profiles
       SET niche = ?, audienceDescription = ?, nicheEmbedding = ?, platforms = ?, location = ?,
           audienceLocations = ?, audienceLocationSource = ?, audienceLocationAsOf = ?,
           audienceLocationCoverageComplete = ?
       WHERE profileId = ?`,
      [
        niche,
        audienceDescription,
        nicheEmbedding,
        platforms || null,
        location || null,
        savedAudienceLocations || null,
        savedAudienceLocationSource || null,
        savedAudienceLocationAsOf || null,
        booleanValue(savedCoverageComplete),
        profileId,
      ]
    );

    return profileId;
  }

  const [result] = await db.query(
    `INSERT INTO creator_profiles
     (creatorId, niche, audienceDescription, nicheEmbedding, platforms, location,
      audienceLocations, audienceLocationSource, audienceLocationAsOf, audienceLocationCoverageComplete)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      creatorId,
      niche,
      audienceDescription,
      nicheEmbedding,
      platforms || null,
      location || null,
      audienceLocations || null,
      audienceLocationSource || null,
      audienceLocationAsOf || null,
      booleanValue(audienceLocationCoverageComplete),
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
