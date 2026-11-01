'use strict';

const { amountToCents, centsToAmount, estimateOfferCents } = require('../services/campaignBudget');

function createRouter({ express, db, verifyToken }) {
  const router = express.Router();
  router.use(verifyToken);
  router.use(async (req, res, next) => {
    try {
      const [users] = await db.query('SELECT role FROM users WHERE userId = ? LIMIT 1', [req.user.userId]);
      if (!users.length || users[0].role !== 'business') return res.status(403).json({ error: 'Forbidden' });
      const [businesses] = await db.query('SELECT businessId FROM businesses WHERE userId = ? LIMIT 1', [req.user.userId]);
      if (!businesses.length) return res.status(404).json({ error: 'Business not found' });
      req.businessId = businesses[0].businessId;
      return next();
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  function parseId(value, label) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  async function ownedCampaign(campaignId, businessId, { lock = false } = {}) {
    const [rows] = await db.query(
      `SELECT campaignId, publicationStatus, totalBudget, currency, targetCreatorCount FROM campaigns
       WHERE campaignId = ? AND businessId = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [campaignId, businessId]
    );
    return rows[0] || null;
  }

  router.get('/creators', async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search.length > 100) return res.status(400).json({ error: 'search must be 100 characters or fewer' });
    try {
      const like = `%${search}%`;
      const [rows] = await db.query(
        `SELECT c.creatorId, u.name AS displayName, c.publicHandle AS username,
                p.bio, p.niche, p.audienceDescription, p.platforms, p.location,
                p.portfolioUrl, p.followerCount, p.selfReportedEngagement
         FROM creators c JOIN users u ON u.userId = c.userId
         LEFT JOIN creator_profiles p ON p.creatorId = c.creatorId
         WHERE u.role = 'creator' AND (? = '' OR u.name LIKE ? OR c.publicHandle LIKE ? OR p.niche LIKE ?)
         ORDER BY u.name LIMIT 100`,
        [search, like, like, like]
      );
      return res.json(rows);
    } catch {
      return res.status(500).json({ error: 'Could not load creator profiles' });
    }
  });

  router.get('/campaigns/:campaignId/applications', async (req, res) => {
    const campaignId = parseId(req.params.campaignId);
    if (!campaignId) return res.status(400).json({ error: 'Invalid campaign id' });
    try {
      const campaign = await ownedCampaign(campaignId, req.businessId);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      const [rows] = await db.query(
        `SELECT a.applicationId, a.campaignId, a.status, a.applicationMessage, a.createdAt, a.updatedAt,
                c.creatorId, c.publicHandle AS username, u.name AS displayName,
                p.bio, p.niche, p.audienceDescription, p.platforms, p.location, p.portfolioUrl,
                p.followerCount, p.selfReportedEngagement
         FROM campaign_applications a
         JOIN creators c ON c.creatorId = a.creatorId
         JOIN users u ON u.userId = c.userId AND u.role = 'creator'
         LEFT JOIN creator_profiles p ON p.creatorId = c.creatorId
         WHERE a.campaignId = ? ORDER BY a.createdAt DESC`,
        [campaignId]
      );
      return res.json(rows);
    } catch {
      return res.status(500).json({ error: 'Could not load campaign applications' });
    }
  });

  router.patch('/campaigns/:campaignId/applications/:applicationId', async (req, res) => {
    const campaignId = parseId(req.params.campaignId);
    const applicationId = parseId(req.params.applicationId);
    const { status } = req.body || {};
    if (!campaignId || !applicationId) return res.status(400).json({ error: 'Invalid campaign or application id' });
    if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be accepted or rejected' });

    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      const [campaigns] = await connection.query(
        'SELECT campaignId, targetCreatorCount FROM campaigns WHERE campaignId = ? AND businessId = ? LIMIT 1 FOR UPDATE',
        [campaignId, req.businessId]
      );
      if (!campaigns.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Campaign not found' });
      }
      const [applications] = await connection.query(
        'SELECT applicationId, creatorId, status FROM campaign_applications WHERE applicationId = ? AND campaignId = ? LIMIT 1 FOR UPDATE',
        [applicationId, campaignId]
      );
      if (!applications.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Application not found' });
      }
      const application = applications[0];
      if (application.status !== 'pending') {
        await connection.rollback();
        return res.status(409).json({ error: 'Only pending applications can be decided' });
      }
      if (status === 'accepted') {
        const [filledRows] = await connection.query(
          `SELECT COUNT(*) AS filledCreatorSlots FROM (
             SELECT creatorId FROM campaign_invitations WHERE campaignId = ? AND status = 'accepted'
             UNION
             SELECT creatorId FROM campaign_applications WHERE campaignId = ? AND status = 'accepted'
           ) accepted_creators`,
          [campaignId, campaignId]
        );
        if (Number(filledRows[0]?.filledCreatorSlots || 0) >= Number(campaigns[0].targetCreatorCount || 1)) {
          await connection.rollback();
          return res.status(409).json({ error: 'Campaign has no remaining creator slots' });
        }
        const [acceptedInvitations] = await connection.query(
          "SELECT invitationId FROM campaign_invitations WHERE campaignId = ? AND creatorId = ? AND status = 'accepted' LIMIT 1 FOR UPDATE",
          [campaignId, application.creatorId]
        );
        if (acceptedInvitations.length) {
          await connection.rollback();
          return res.status(409).json({ error: 'Creator already accepted an invitation for this campaign' });
        }
        await connection.query(
          "UPDATE campaign_invitations SET status = 'declined', respondedAt = CURRENT_TIMESTAMP WHERE campaignId = ? AND creatorId = ? AND status = 'pending'",
          [campaignId, application.creatorId]
        );
      }
      await connection.query(
        "UPDATE campaign_applications SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE applicationId = ? AND status = 'pending'",
        [status, applicationId]
      );
      await connection.commit();
      return res.json({ applicationId, campaignId, status });
    } catch {
      if (connection) await connection.rollback();
      return res.status(500).json({ error: 'Could not update application' });
    } finally {
      connection?.release();
    }
  });

  router.get('/campaigns/:campaignId/invitations', async (req, res) => {
    const campaignId = parseId(req.params.campaignId);
    if (!campaignId) return res.status(400).json({ error: 'Invalid campaign id' });
    try {
      const campaign = await ownedCampaign(campaignId, req.businessId);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      const [rows] = await db.query(
        `SELECT i.invitationId, i.campaignId, i.creatorId, i.status, i.offeredAmount, i.invitationMessage,
                i.expiresAt, i.createdAt, i.respondedAt, ca.currency, c.publicHandle AS username,
                u.name AS displayName, p.niche, p.bio
         FROM campaign_invitations i
         JOIN campaigns ca ON ca.campaignId = i.campaignId
         JOIN creators c ON c.creatorId = i.creatorId
         JOIN users u ON u.userId = c.userId AND u.role = 'creator'
         LEFT JOIN creator_profiles p ON p.creatorId = c.creatorId
         WHERE i.campaignId = ? ORDER BY i.createdAt DESC`,
        [campaignId]
      );
      return res.json(rows);
    } catch {
      return res.status(500).json({ error: 'Could not load campaign invitations' });
    }
  });

  router.post('/campaigns/:campaignId/invitations', async (req, res) => {
    const campaignId = parseId(req.params.campaignId);
    const creatorId = parseId(req.body?.creatorId);
    const message = req.body?.message;
    if (!campaignId || !creatorId) return res.status(400).json({ error: 'Valid campaignId and creatorId are required' });
    if (message !== undefined && (typeof message !== 'string' || message.trim().length > 2000)) {
      return res.status(400).json({ error: 'message must be a string of 2000 characters or fewer' });
    }
    const requestedAmount = req.body?.offeredAmount;
    if (requestedAmount !== undefined && amountToCents(requestedAmount) === null) {
      return res.status(400).json({ error: 'offeredAmount must be a non-negative amount with up to 2 decimal places' });
    }

    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      const [campaigns] = await connection.query(
        "SELECT campaignId, totalBudget, currency, targetCreatorCount FROM campaigns WHERE campaignId = ? AND businessId = ? AND publicationStatus = 'open' LIMIT 1 FOR UPDATE",
        [campaignId, req.businessId]
      );
      if (!campaigns.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Open campaign not found' });
      }
      const [creators] = await connection.query(
        `SELECT c.creatorId FROM creators c JOIN users u ON u.userId = c.userId
         WHERE c.creatorId = ? AND u.role = 'creator' LIMIT 1`,
        [creatorId]
      );
      if (!creators.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Creator not found' });
      }
      const [existing] = await connection.query(
        "SELECT invitationId FROM campaign_invitations WHERE campaignId = ? AND creatorId = ? AND status = 'pending' LIMIT 1 FOR UPDATE",
        [campaignId, creatorId]
      );
      if (existing.length) {
        await connection.rollback();
        return res.status(409).json({ error: 'A pending invitation already exists for this creator' });
      }
      const campaign = campaigns[0];
      const suggestedCents = estimateOfferCents(campaign.totalBudget, Number(campaign.targetCreatorCount));
      const offeredCents = requestedAmount === undefined ? suggestedCents : amountToCents(requestedAmount);
      if (offeredCents === null || offeredCents <= 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Campaign needs a positive budget and target creator count before inviting creators' });
      }
      const [allocations] = await connection.query(
        "SELECT COALESCE(SUM(offeredAmount), 0) AS allocatedBudget FROM campaign_invitations WHERE campaignId = ? AND (status = 'accepted' OR (status = 'pending' AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)))",
        [campaignId]
      );
      const allocatedCents = amountToCents(allocations[0]?.allocatedBudget || 0) || 0;
      const totalBudgetCents = amountToCents(campaign.totalBudget) || 0;
      if (allocatedCents + offeredCents > totalBudgetCents) {
        await connection.rollback();
        return res.status(409).json({ error: 'Offer exceeds the campaign budget remaining after pending and accepted offers' });
      }
      const [filledRows] = await connection.query(
        `SELECT COUNT(*) AS filledCreatorSlots FROM (
           SELECT creatorId FROM campaign_invitations WHERE campaignId = ? AND status = 'accepted'
           UNION
           SELECT creatorId FROM campaign_applications WHERE campaignId = ? AND status = 'accepted'
         ) accepted_creators`,
        [campaignId, campaignId]
      );
      if (Number(filledRows[0]?.filledCreatorSlots || 0) >= Number(campaign.targetCreatorCount)) {
        await connection.rollback();
        return res.status(409).json({ error: 'Campaign has no remaining creator slots' });
      }
      const [result] = await connection.query(
        "INSERT INTO campaign_invitations (campaignId, creatorId, invitedBy, invitationMessage, offeredAmount, status) VALUES (?, ?, ?, ?, ?, 'pending')",
        [campaignId, creatorId, req.user.userId, message?.trim() || null, centsToAmount(offeredCents)]
      );
      await connection.commit();
      return res.status(201).json({ invitationId: result.insertId, campaignId, creatorId, offeredAmount: centsToAmount(offeredCents), currency: campaign.currency, suggestedOffer: centsToAmount(suggestedCents), status: 'pending' });
    } catch (error) {
      if (connection) await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Invitation already exists' });
      return res.status(500).json({ error: 'Could not create invitation' });
    } finally {
      connection?.release();
    }
  });

  return router;
}

module.exports = { createRouter };