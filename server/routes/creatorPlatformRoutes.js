'use strict';

const allowedAvailability = new Set(['available', 'limited', 'unavailable']);
const profileFields = new Set([
  'displayName', 'username', 'bio', 'niche', 'audienceDescription', 'location', 'platforms',
  'portfolioUrl', 'availability', 'preferences',
]);

function parsePreferences(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

function profileCompletion(profile) {
  const fields = [profile.displayName, profile.username, profile.bio, profile.niche,
    profile.audienceDescription, profile.platforms, profile.location, profile.portfolioUrl];
  return Math.round((fields.filter(value => typeof value === 'string' && value.trim()).length / fields.length) * 100);
}

function validateProfile(body, method) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid profile';
  if (Object.keys(body).some(key => !profileFields.has(key))) return 'Unsupported profile field';
  if (method === 'PATCH' && Object.keys(body).length === 0) return 'Supply at least one profile field';
  if (method === 'PUT' && ['displayName', 'username', 'bio', 'niche'].some(key => typeof body[key] !== 'string' || !body[key].trim())) {
    return 'displayName, username, bio, and niche are required';
  }

  const limits = { displayName: 255, username: 255, bio: 5000, niche: 255, audienceDescription: 2000, location: 255, platforms: 255, portfolioUrl: 2048 };
  for (const [key, limit] of Object.entries(limits)) {
    const value = body[key];
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > limit)) {
      return `${key} must be a string of ${limit} characters or fewer`;
    }
  }
  if (body.availability !== undefined && body.availability !== null && !allowedAvailability.has(body.availability)) {
    return 'availability is invalid';
  }
  if (body.portfolioUrl) {
    try {
      const url = new URL(body.portfolioUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return 'portfolioUrl must use HTTP or HTTPS';
    } catch { return 'portfolioUrl must be a valid URL'; }
  }
  if (body.preferences !== undefined && body.preferences !== null
    && (typeof body.preferences !== 'object' || Array.isArray(body.preferences)
      || Buffer.byteLength(JSON.stringify(body.preferences), 'utf8') > 4000)) {
    return 'preferences must be a JSON object no larger than 4000 bytes';
  }
  return null;
}

function createRouter({ express, db, verifyToken }) {
  const router = express.Router();
  router.use(verifyToken);
  router.use(async (req, res, next) => {
    try {
      const [users] = await db.query('SELECT role FROM users WHERE userId = ? LIMIT 1', [req.user.userId]);
      if (!users.length || users[0].role !== 'creator') return res.status(403).json({ error: 'Forbidden' });
      const [creators] = await db.query('SELECT creatorId FROM creators WHERE userId = ? LIMIT 1', [req.user.userId]);
      if (!creators.length) return res.status(404).json({ error: 'Creator not found' });
      req.creatorId = creators[0].creatorId;
      return next();
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  async function getProfile(req, res) {
    try {
      const [rows] = await db.query(
        `SELECT u.name AS displayName, c.publicHandle AS username,
                p.niche, p.audienceDescription, p.bio, p.platforms, p.location, p.portfolioUrl,
                p.availability, p.preferences, p.followerCount, p.selfReportedEngagement
         FROM creators c JOIN users u ON u.userId = c.userId
         LEFT JOIN creator_profiles p ON p.creatorId = c.creatorId
         WHERE c.creatorId = ? LIMIT 1`,
        [req.creatorId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Creator not found' });
      const profile = { ...rows[0], preferences: parsePreferences(rows[0].preferences) };
      profile.profileCompletion = profileCompletion(profile);
      return res.json(profile);
    } catch {
      return res.status(500).json({ error: 'Could not load creator profile' });
    }
  }

  async function saveProfile(req, res) {
    const validationError = validateProfile(req.body, req.method);
    if (validationError) return res.status(400).json({ error: validationError });

    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      const body = req.body;
      if (body.displayName !== undefined) {
        await connection.query('UPDATE users SET name = ? WHERE userId = ?', [body.displayName.trim(), req.user.userId]);
      }
      if (body.username !== undefined) {
        await connection.query('UPDATE creators SET publicHandle = ? WHERE creatorId = ?', [body.username.trim(), req.creatorId]);
      }
      const [existing] = await connection.query(
        'SELECT profileId, niche, audienceDescription, nicheEmbedding, platforms, location, bio, portfolioUrl, availability, preferences FROM creator_profiles WHERE creatorId = ? LIMIT 1',
        [req.creatorId]
      );
      const old = existing[0] || {};
      const current = {
        niche: old.niche || null,
        audienceDescription: old.audienceDescription || null,
        platforms: old.platforms || null,
        location: old.location || null,
        bio: old.bio || null,
        portfolioUrl: old.portfolioUrl || null,
        availability: old.availability || null,
        preferences: parsePreferences(old.preferences),
      };
      for (const key of ['niche', 'audienceDescription', 'platforms', 'location', 'bio', 'portfolioUrl', 'availability', 'preferences']) {
        if (body[key] !== undefined) current[key] = typeof body[key] === 'string' ? body[key].trim() || null : body[key];
      }
      const audienceDescription = current.audienceDescription;
      let nicheEmbedding = old.nicheEmbedding || null;
      if (body.niche !== undefined && current.niche !== old.niche) {
        const embeddingText = [current.niche, audienceDescription].filter(Boolean).join(' ');
        try {
          const { getEmbedding } = require('../services/embeddingService');
          nicheEmbedding = JSON.stringify(await getEmbedding(embeddingText));
        } catch { nicheEmbedding = null; }
      }
      const values = [req.creatorId, current.niche, audienceDescription, nicheEmbedding,
        current.platforms, current.location, current.bio, current.portfolioUrl,
        current.availability, current.preferences == null ? null : JSON.stringify(current.preferences)];
      if (existing.length) {
        await connection.query(
          `UPDATE creator_profiles SET niche = ?, audienceDescription = ?, nicheEmbedding = ?, platforms = ?, location = ?,
           bio = ?, portfolioUrl = ?, availability = ?, preferences = ? WHERE profileId = ?`,
          [...values.slice(1), existing[0].profileId]
        );
      } else {
        await connection.query(
          `INSERT INTO creator_profiles
           (creatorId, niche, audienceDescription, nicheEmbedding, platforms, location, bio, portfolioUrl, availability, preferences)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values
        );
      }
      await connection.commit();
      return getProfile(req, res);
    } catch {
      if (connection) await connection.rollback();
      return res.status(500).json({ error: 'Could not save creator profile' });
    } finally {
      connection?.release();
    }
  }

  router.get('/profile', getProfile);
  router.put('/profile', saveProfile);
  router.patch('/profile', saveProfile);

  router.get('/overview', async (req, res) => {
    try {
      const [[openCampaigns]] = await db.query(
        `SELECT COUNT(*) AS count FROM campaigns c
         JOIN businesses b ON b.businessId = c.businessId
         WHERE c.publicationStatus = 'open' AND b.userId <> ?`,
        [req.user.userId]
      );
      const [[applications]] = await db.query("SELECT COUNT(*) AS count FROM campaign_applications WHERE creatorId = ? AND status = 'pending'", [req.creatorId]);
      const [[invitations]] = await db.query("SELECT COUNT(*) AS count FROM campaign_invitations WHERE creatorId = ? AND status = 'pending' AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)", [req.creatorId]);
      return res.json({ openCampaigns: Number(openCampaigns.count), pendingApplications: Number(applications.count), pendingInvitations: Number(invitations.count), collaborations: null });
    } catch {
      return res.status(500).json({ error: 'Could not load creator overview' });
    }
  });

  router.get('/campaigns', async (req, res) => {
    const filters = {};
    for (const key of ['category', 'platform', 'location', 'objective']) {
      const value = req.query[key];
      if (value !== undefined && (typeof value !== 'string' || value.trim().length > 100)) {
        return res.status(400).json({ error: `${key} must be 100 characters or fewer` });
      }
      filters[key] = typeof value === 'string' ? value.trim() : '';
    }
    try {
      const [campaigns] = await db.query(
        `SELECT c.campaignId, c.nicheText, c.targetAudience, c.budgetRange,
                c.preferredPlatforms, c.location, c.campaignGoal, c.createdAt, c.publicationStatus,
                b.businessName, b.industry, a.applicationId, a.createdAt AS applicationCreatedAt, a.status AS applicationStatus
         FROM campaigns c JOIN businesses b ON b.businessId = c.businessId
         LEFT JOIN campaign_applications a ON a.campaignId = c.campaignId AND a.creatorId = ?
         WHERE c.publicationStatus = 'open' AND b.userId <> ?
           AND (? = '' OR b.industry LIKE ? OR c.nicheText LIKE ?)
           AND (? = '' OR c.preferredPlatforms LIKE ?)
           AND (? = '' OR c.location LIKE ?)
           AND (? = '' OR c.campaignGoal LIKE ?)
         ORDER BY c.createdAt DESC`,
        [req.creatorId, req.user.userId,
          filters.category, `%${filters.category}%`, `%${filters.category}%`,
          filters.platform, `%${filters.platform}%`, filters.location, `%${filters.location}%`,
          filters.objective, `%${filters.objective}%`]
      );
      return res.json(campaigns);
    } catch {
      return res.status(500).json({ error: 'Could not load campaigns' });
    }
  });

  router.get('/campaigns/:campaignId', async (req, res) => {
    const campaignId = Number(req.params.campaignId);
    if (!Number.isInteger(campaignId) || campaignId <= 0) return res.status(400).json({ error: 'Invalid campaign id' });
    try {
      const [rows] = await db.query(
        `SELECT c.campaignId, c.nicheText, c.targetAudience, c.budgetRange,
                c.preferredPlatforms, c.location, c.campaignGoal, c.createdAt,
                b.businessName, b.industry, a.applicationId, a.createdAt AS applicationCreatedAt, a.status AS applicationStatus
         FROM campaigns c JOIN businesses b ON b.businessId = c.businessId
         LEFT JOIN campaign_applications a ON a.campaignId = c.campaignId AND a.creatorId = ?
         WHERE c.campaignId = ? AND c.publicationStatus = 'open' AND b.userId <> ? LIMIT 1`,
        [req.creatorId, campaignId, req.user.userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
      return res.json(rows[0]);
    } catch {
      return res.status(500).json({ error: 'Could not load campaign' });
    }
  });

  router.post('/campaigns/:campaignId/apply', async (req, res) => {
    const campaignId = Number(req.params.campaignId);
    if (!Number.isInteger(campaignId) || campaignId <= 0) return res.status(400).json({ error: 'Invalid campaign id' });
    const message = req.body?.message;
    if (message !== undefined && (typeof message !== 'string' || message.trim().length > 2000)) {
      return res.status(400).json({ error: 'message must be a string of 2000 characters or fewer' });
    }
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      const [openCampaign] = await connection.query(
        `SELECT c.campaignId FROM campaigns c JOIN businesses b ON b.businessId = c.businessId
         WHERE c.campaignId = ? AND c.publicationStatus = 'open' AND b.userId <> ? LIMIT 1 FOR UPDATE`,
        [campaignId, req.user.userId]
      );
      if (!openCampaign.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Campaign not found' });
      }
      const [profiles] = await connection.query('SELECT profileId FROM creator_profiles WHERE creatorId = ? LIMIT 1', [req.creatorId]);
      if (!profiles.length) {
        await connection.rollback();
        return res.status(400).json({ error: 'Complete your creator profile before applying' });
      }
      const [acceptedInvitations] = await connection.query(
        "SELECT invitationId FROM campaign_invitations WHERE campaignId = ? AND creatorId = ? AND status = 'accepted' LIMIT 1",
        [campaignId, req.creatorId]
      );
      if (acceptedInvitations.length) {
        await connection.rollback();
        return res.status(409).json({ error: 'You already accepted an invitation for this campaign' });
      }
      const [result] = await connection.query(
        "INSERT INTO campaign_applications (campaignId, creatorId, applicationMessage, status) VALUES (?, ?, ?, 'pending')",
        [campaignId, req.creatorId, message?.trim() || null]
      );
      await connection.commit();
      return res.status(201).json({ applicationId: result.insertId, campaignId, status: 'pending' });
    } catch (error) {
      if (connection) await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You have already applied to this campaign' });
      return res.status(500).json({ error: 'Could not submit application' });
    } finally {
      connection?.release();
    }
  });

  router.get('/applications', async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT a.applicationId, a.campaignId, a.status, a.applicationMessage, a.createdAt, a.updatedAt,
                c.nicheText, c.campaignGoal, b.businessName
         FROM campaign_applications a
         JOIN campaigns c ON c.campaignId = a.campaignId
         JOIN businesses b ON b.businessId = c.businessId
         WHERE a.creatorId = ? ORDER BY a.createdAt DESC`,
        [req.creatorId]
      );
      return res.json(rows);
    } catch {
      return res.status(500).json({ error: 'Could not load applications' });
    }
  });

  router.post('/applications/:applicationId/withdraw', async (req, res) => {
    const applicationId = Number(req.params.applicationId);
    if (!Number.isInteger(applicationId) || applicationId <= 0) return res.status(400).json({ error: 'Invalid application id' });
    try {
      const [result] = await db.query(
        "UPDATE campaign_applications SET status = 'withdrawn', updatedAt = CURRENT_TIMESTAMP WHERE applicationId = ? AND creatorId = ? AND status = 'pending'",
        [applicationId, req.creatorId]
      );
      if (result.affectedRows) return res.json({ applicationId, status: 'withdrawn' });
      const [rows] = await db.query('SELECT status FROM campaign_applications WHERE applicationId = ? AND creatorId = ? LIMIT 1', [applicationId, req.creatorId]);
      if (!rows.length) return res.status(404).json({ error: 'Application not found' });
      return res.status(409).json({ error: 'Only pending applications can be withdrawn' });
    } catch {
      return res.status(500).json({ error: 'Could not withdraw application' });
    }
  });

  router.get('/invitations', async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT i.invitationId, i.campaignId, i.status, i.invitationMessage, i.expiresAt, i.createdAt, i.respondedAt,
                i.offeredAmount, c.currency,
                c.nicheText, c.targetAudience, c.budgetRange, c.campaignGoal, c.preferredPlatforms, c.location, b.businessName
         FROM campaign_invitations i
         JOIN campaigns c ON c.campaignId = i.campaignId
         JOIN businesses b ON b.businessId = c.businessId
         WHERE i.creatorId = ? ORDER BY i.createdAt DESC`,
        [req.creatorId]
      );
      return res.json(rows);
    } catch {
      return res.status(500).json({ error: 'Could not load invitations' });
    }
  });

  async function respondToInvitation(req, res, status) {
    const invitationId = Number(req.params.invitationId);
    if (!Number.isInteger(invitationId) || invitationId <= 0) return res.status(400).json({ error: 'Invalid invitation id' });
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      const [invitationRefs] = await connection.query(
        'SELECT campaignId FROM campaign_invitations WHERE invitationId = ? AND creatorId = ? LIMIT 1',
        [invitationId, req.creatorId]
      );
      if (!invitationRefs.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Invitation not found' });
      }
      const [lockedCampaigns] = await connection.query('SELECT campaignId, targetCreatorCount FROM campaigns WHERE campaignId = ? LIMIT 1 FOR UPDATE', [invitationRefs[0].campaignId]);
      if (!lockedCampaigns.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Campaign not found' });
      }
      const [invitations] = await connection.query(
        'SELECT campaignId, offeredAmount FROM campaign_invitations WHERE invitationId = ? AND creatorId = ? LIMIT 1 FOR UPDATE',
        [invitationId, req.creatorId]
      );
      if (!invitations.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Invitation not found' });
      }
      if (status === 'accepted') {
        const [filledRows] = await connection.query(
          `SELECT COUNT(*) AS filledCreatorSlots FROM (
             SELECT creatorId FROM campaign_invitations WHERE campaignId = ? AND status = 'accepted'
             UNION
             SELECT creatorId FROM campaign_applications WHERE campaignId = ? AND status = 'accepted'
           ) accepted_creators`,
          [invitations[0].campaignId, invitations[0].campaignId]
        );
        if (Number(filledRows[0]?.filledCreatorSlots || 0) >= Number(lockedCampaigns[0].targetCreatorCount || 1)) {
          await connection.rollback();
          return res.status(409).json({ error: 'Campaign has no remaining creator slots' });
        }
        const [acceptedApplications] = await connection.query(
          "SELECT applicationId FROM campaign_applications WHERE campaignId = ? AND creatorId = ? AND status = 'accepted' LIMIT 1 FOR UPDATE",
          [invitations[0].campaignId, req.creatorId]
        );
        if (acceptedApplications.length) {
          await connection.rollback();
          return res.status(409).json({ error: 'You already have an accepted application for this campaign' });
        }
      }
      const [result] = await connection.query(
        `UPDATE campaign_invitations SET status = ?, respondedAt = CURRENT_TIMESTAMP
         WHERE invitationId = ? AND creatorId = ? AND status = 'pending'
           AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)`,
        [status, invitationId, req.creatorId]
      );
      if (result.affectedRows) {
        if (status === 'accepted') {
          await connection.query(
            "UPDATE campaign_applications SET status = 'rejected', updatedAt = CURRENT_TIMESTAMP WHERE campaignId = ? AND creatorId = ? AND status = 'pending'",
            [invitations[0].campaignId, req.creatorId]
          );
        }
        await connection.commit();
        return res.json({ invitationId, status, ...(status === 'accepted' ? { offeredAmount: Number(invitations[0].offeredAmount) } : {}) });
      }
      const [rows] = await connection.query('SELECT status, expiresAt FROM campaign_invitations WHERE invitationId = ? AND creatorId = ? LIMIT 1', [invitationId, req.creatorId]);
      if (!rows.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Invitation not found' });
      }
      if (rows[0].status === 'pending' && rows[0].expiresAt && new Date(rows[0].expiresAt) <= new Date()) {
        await connection.query("UPDATE campaign_invitations SET status = 'expired' WHERE invitationId = ? AND creatorId = ? AND status = 'pending'", [invitationId, req.creatorId]);
        await connection.commit();
        return res.status(409).json({ error: 'Invitation has expired' });
      }
      await connection.rollback();
      return res.status(409).json({ error: 'Invitation is no longer pending' });
    } catch {
      if (connection) await connection.rollback();
      return res.status(500).json({ error: 'Could not update invitation' });
    } finally {
      connection?.release();
    }
  }

  router.post('/invitations/:invitationId/accept', (req, res) => respondToInvitation(req, res, 'accepted'));
  router.post('/invitations/:invitationId/decline', (req, res) => respondToInvitation(req, res, 'declined'));
  return router;
}

module.exports = { createRouter, validateProfile, profileCompletion };