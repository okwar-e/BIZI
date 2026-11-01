const db = require('../config/db');
const campaignModel = require('../models/campaignModel');
const { validateCampaignBudget } = require('../services/campaignBudget');

async function findBusinessIdByUserId(userId) {
  const [rows] = await db.query(
    `SELECT businessId FROM businesses WHERE userId = ? LIMIT 1`,
    [userId]
  );

  return rows.length > 0 ? rows[0].businessId : null;
}

function hasRequiredNicheText(nicheText) {
  return typeof nicheText === 'string' && nicheText.trim().length > 0;
}

function getCampaignFields(body) {
  const {
    nicheText,
    targetAudience,
    budgetRange,
    preferredPlatforms,
    location,
    campaignGoal,
  } = body;

  const budget = validateCampaignBudget(body, { allowDefaults: true });
  if (budget.error) return budget;

  return { value: {
    nicheText,
    targetAudience,
    budgetRange,
    preferredPlatforms,
    location,
    campaignGoal,
    totalBudget: budget.value.totalBudget,
    currency: budget.value.currency,
    targetCreatorCount: budget.value.targetCreatorCount,
  } };
}

async function createCampaign(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const parsed = getCampaignFields(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const fields = parsed.value;
  if (!hasRequiredNicheText(fields.nicheText)) {
    return res.status(400).json({ error: 'nicheText is required' });
  }

  try {
    const businessId = await findBusinessIdByUserId(req.user.userId);
    if (!businessId) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const campaignId = await campaignModel.createCampaign(businessId, fields);
    return res.status(201).json({ campaignId });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getMyCampaigns(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const businessId = await findBusinessIdByUserId(req.user.userId);
    if (!businessId) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const campaigns = await campaignModel.getCampaignsByBusinessId(businessId);
    return res.status(200).json(campaigns);
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getCampaign(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const businessId = await findBusinessIdByUserId(req.user.userId);
    if (!businessId) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const campaign = await campaignModel.getCampaignById(req.params.campaignId);
    if (!campaign || campaign.businessId !== businessId) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    return res.status(200).json(campaign);
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateCampaign(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const parsed = getCampaignFields(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const fields = parsed.value;
  if (!hasRequiredNicheText(fields.nicheText)) {
    return res.status(400).json({ error: 'nicheText is required' });
  }

  let connection;
  try {
    const businessId = await findBusinessIdByUserId(req.user.userId);
    if (!businessId) {
      return res.status(404).json({ error: 'Business not found' });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    const [owned] = await connection.query(
      'SELECT campaignId, currency FROM campaigns WHERE campaignId = ? AND businessId = ? LIMIT 1 FOR UPDATE',
      [req.params.campaignId, businessId]
    );
    if (!owned.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const [[allocation]] = await connection.query(
      "SELECT COALESCE(SUM(offeredAmount), 0) AS allocatedBudget FROM campaign_invitations WHERE campaignId = ? AND (status = 'accepted' OR (status = 'pending' AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)))",
      [req.params.campaignId]
    );
    if (Number(fields.totalBudget) < Number(allocation.allocatedBudget || 0)) {
      await connection.rollback();
      return res.status(409).json({ error: 'Total budget cannot be lower than pending and accepted offers' });
    }
    const [[activeInvitations]] = await connection.query(
      "SELECT COUNT(*) AS count FROM campaign_invitations WHERE campaignId = ? AND (status = 'accepted' OR (status = 'pending' AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)))",
      [req.params.campaignId]
    );
    if (fields.currency !== owned[0].currency && Number(activeInvitations.count) > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Currency cannot change while pending or accepted offers exist' });
    }
    const [[filled]] = await connection.query(
      `SELECT COUNT(*) AS filledCreatorSlots FROM (
         SELECT creatorId FROM campaign_invitations WHERE campaignId = ? AND status = 'accepted'
         UNION
         SELECT creatorId FROM campaign_applications WHERE campaignId = ? AND status = 'accepted'
       ) accepted_creators`,
      [req.params.campaignId, req.params.campaignId]
    );
    if (fields.targetCreatorCount < Number(filled.filledCreatorSlots || 0)) {
      await connection.rollback();
      return res.status(409).json({ error: 'Target creator count cannot be lower than filled creator slots' });
    }

    const affectedRows = await campaignModel.updateCampaign(
      req.params.campaignId,
      businessId,
      fields,
      { query: connection.query.bind(connection) }
    );

    await connection.commit();
    if (affectedRows === 0) return res.status(200).json({ message: 'Campaign unchanged' });

    return res.status(200).json({ message: 'Campaign updated' });
  } catch (error) {
    if (connection) await connection.rollback();
    return res.status(500).json({ error: 'Server error' });
  } finally {
    connection?.release();
  }
}

async function deleteCampaign(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const businessId = await findBusinessIdByUserId(req.user.userId);
    if (!businessId) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const affectedRows = await campaignModel.deleteCampaign(
      req.params.campaignId,
      businessId
    );

    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    return res.status(200).json({ message: 'Campaign deleted' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function setCampaignPublication(req, res) {
  if (!req.user || req.user.role !== 'business') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { publicationStatus } = req.body || {};
  if (!['draft', 'open', 'closed'].includes(publicationStatus)) {
    return res.status(400).json({ error: 'publicationStatus must be draft, open, or closed' });
  }
  const campaignId = Number(req.params.campaignId);
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return res.status(400).json({ error: 'Invalid campaign id' });
  }
  try {
    const [rows] = await db.query(
      `SELECT c.campaignId FROM campaigns c
       JOIN businesses b ON b.businessId = c.businessId
       WHERE c.campaignId = ? AND b.userId = ? LIMIT 1`,
      [campaignId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
    await db.query('UPDATE campaigns SET publicationStatus = ? WHERE campaignId = ?', [publicationStatus, campaignId]);
    return res.status(200).json({ campaignId, publicationStatus });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  createCampaign,
  getMyCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  setCampaignPublication,
};
