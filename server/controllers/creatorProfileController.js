const db = require('../config/db');
const creatorProfileModel = require('../models/creatorProfileModel');

async function findCreatorIdByUserId(userId) {
  const [rows] = await db.query(
    `SELECT creatorId FROM creators WHERE userId = ? LIMIT 1`,
    [userId]
  );

  return rows.length > 0 ? rows[0].creatorId : null;
}

async function upsertProfile(req, res) {
  if (!req.user || req.user.role !== 'creator') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { niche, audienceDescription, platforms, location } = req.body;

  if (typeof niche !== 'string' || niche.trim().length === 0) {
    return res.status(400).json({ error: 'niche is required' });
  }

  if (typeof audienceDescription !== 'string' || audienceDescription.trim().length === 0) {
    return res.status(400).json({ error: 'audienceDescription is required' });
  }

  try {
    const creatorId = await findCreatorIdByUserId(req.user.userId);
    if (!creatorId) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    const profileId = await creatorProfileModel.createOrUpdateProfile(creatorId, {
      niche,
      audienceDescription,
      platforms,
      location,
    });

    return res.status(200).json({ profileId });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getMyProfile(req, res) {
  if (!req.user || req.user.role !== 'creator') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const creatorId = await findCreatorIdByUserId(req.user.userId);
    if (!creatorId) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    const profile = await creatorProfileModel.getProfileByCreatorId(creatorId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json(profile);
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

async function updateSelfReportedMetrics(req, res) {
  if (!req.user || req.user.role !== 'creator') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { selfReportedEngagement, followerCount } = req.body;

  if (!isNonNegativeNumber(selfReportedEngagement)) {
    return res.status(400).json({ error: 'selfReportedEngagement must be a number >= 0' });
  }

  if (!isNonNegativeNumber(followerCount)) {
    return res.status(400).json({ error: 'followerCount must be a number >= 0' });
  }

  try {
    const creatorId = await findCreatorIdByUserId(req.user.userId);
    if (!creatorId) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    const affectedRows = await creatorProfileModel.updateSelfReportedMetrics(creatorId, {
      selfReportedEngagement,
      followerCount,
    });

    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json({ message: 'Metrics updated' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  upsertProfile,
  getMyProfile,
  updateSelfReportedMetrics,
};
