'use strict';

const db = require('../config/db');
const { validateCampaignApplication } = require('../services/campaignApplication');
const { amountToCents, validateCampaignBudget } = require('../services/campaignBudget');

const NAMESPACE = 'bizi-demo-activity-v1';
const SAMPLE_NAMESPACE = 'bizi-dataset-samples-v1';
const DEFAULT_BUSINESS_EMAIL = 'collinsokware7@gmail.com';
const CAMPAIGN_PLANS = [
  { targetCreatorCount: 3, totalBudget: 30000, invitationAmount: 5000 },
  { targetCreatorCount: 4, totalBudget: 40000 },
  { targetCreatorCount: 5, totalBudget: 50000 },
];
const EXPECTED_COUNTS = { campaign: 3, application: 12, invitation: 1 };

async function record(connection, recordKey, entityType, entityId, details) {
  await connection.query(
    `INSERT INTO demo_dataset_records (namespace, recordKey, entityType, entityId, provenance)
     VALUES (?, ?, ?, ?, ?)`,
    [NAMESPACE, recordKey, entityType, String(entityId), JSON.stringify({
      dataOrigin: 'synthetic_demo_marketplace_activity',
      source: 'seedDemoMarketplaceActivity.js',
      ...details,
    })]
  );
}

async function findActivityBusiness(connection) {
  const businessEmail = process.env.BIZI_DEMO_ACTIVITY_BUSINESS_EMAIL || DEFAULT_BUSINESS_EMAIL;
  const [rows] = await connection.query(
    `SELECT b.businessId, b.userId
     FROM businesses b
     JOIN users u ON u.userId = b.userId AND u.role = 'business'
     WHERE u.email = ?
     LIMIT 1`,
    [businessEmail]
  );
  if (!rows.length) throw new Error(`No business account was found for ${businessEmail}`);
  return rows[0];
}

async function topSampleNiches(connection) {
  const [rows] = await connection.query(
    `SELECT p.niche, COUNT(*) AS creatorCount
     FROM creators c
     JOIN users u ON u.userId = c.userId AND u.role = 'creator'
     JOIN creator_profiles p ON p.creatorId = c.creatorId
     JOIN demo_dataset_records d ON d.entityType = 'creator'
       AND CAST(d.entityId AS UNSIGNED) = c.creatorId AND d.namespace = ?
     WHERE NULLIF(TRIM(p.niche), '') IS NOT NULL AND LOWER(TRIM(p.niche)) <> 'null'
     GROUP BY p.niche
     ORDER BY creatorCount DESC, p.niche
     LIMIT 3`,
    [SAMPLE_NAMESPACE]
  );
  if (rows.length !== 3) throw new Error('At least three dataset-sample creator niches are required');
  return rows.map(row => row.niche);
}

async function matchingCreators(connection, niche, limit) {
  const [rows] = await connection.query(
    `SELECT c.creatorId, c.userId
     FROM creators c
     JOIN users u ON u.userId = c.userId AND u.role = 'creator'
     JOIN creator_profiles p ON p.creatorId = c.creatorId
     JOIN demo_dataset_records d ON d.entityType = 'creator'
       AND CAST(d.entityId AS UNSIGNED) = c.creatorId AND d.namespace = ?
     WHERE p.niche = ? AND NULLIF(TRIM(p.bio), '') IS NOT NULL
     ORDER BY c.creatorId
     LIMIT ?`,
    [SAMPLE_NAMESPACE, niche, limit]
  );
  return rows;
}

function existingCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.entityType] = (counts[row.entityType] || 0) + 1;
    return counts;
  }, {});
}

function isCompleteSeed(rows) {
  const counts = existingCounts(rows);
  return Object.entries(EXPECTED_COUNTS).every(([type, count]) => counts[type] === count)
    && rows.length === Object.values(EXPECTED_COUNTS).reduce((sum, count) => sum + count, 0);
}

async function cleanup(connection) {
  const [rows] = await connection.query(
    'SELECT recordKey, entityType, entityId FROM demo_dataset_records WHERE namespace = ? FOR UPDATE',
    [NAMESPACE]
  );
  const idsFor = type => rows
    .filter(row => row.entityType === type)
    .map(row => Number(row.entityId));
  if (rows.some(row => !['campaign', 'application', 'invitation'].includes(row.entityType))) {
    throw new Error('Refusing cleanup because the namespace contains an unexpected entity type');
  }
  const campaignIds = idsFor('campaign');
  const applicationIds = idsFor('application');
  const invitationIds = idsFor('invitation');

  if (campaignIds.length) {
    const [applications] = await connection.query(
      'SELECT applicationId FROM campaign_applications WHERE campaignId IN (?)',
      [campaignIds]
    );
    const [invitations] = await connection.query(
      'SELECT invitationId FROM campaign_invitations WHERE campaignId IN (?)',
      [campaignIds]
    );
    const taggedApplications = new Set(applicationIds);
    const taggedInvitations = new Set(invitationIds);
    if (applications.some(row => !taggedApplications.has(Number(row.applicationId)))
      || invitations.some(row => !taggedInvitations.has(Number(row.invitationId)))) {
      throw new Error('Refusing cleanup because a tagged campaign has activity not created by this seed');
    }
  }

  if (applicationIds.length) {
    await connection.query('DELETE FROM campaign_applications WHERE applicationId IN (?)', [applicationIds]);
  }
  if (invitationIds.length) {
    await connection.query('DELETE FROM campaign_invitations WHERE invitationId IN (?)', [invitationIds]);
  }
  if (campaignIds.length) {
    await connection.query('DELETE FROM campaigns WHERE campaignId IN (?)', [campaignIds]);
  }
  await connection.query('DELETE FROM demo_dataset_records WHERE namespace = ?', [NAMESPACE]);
  return {
    campaignsDeleted: campaignIds.length,
    applicationsDeleted: applicationIds.length,
    invitationsDeleted: invitationIds.length,
  };
}

async function seed(connection) {
  const [existing] = await connection.query(
    'SELECT recordKey, entityType, entityId FROM demo_dataset_records WHERE namespace = ? FOR UPDATE',
    [NAMESPACE]
  );
  const business = await findActivityBusiness(connection);
  if (existing.length) {
    if (!isCompleteSeed(existing)) {
      throw new Error('A partial demo activity seed exists; run with --cleanup before reseeding');
    }
    const campaignIds = existing
      .filter(row => row.entityType === 'campaign')
      .map(row => Number(row.entityId));
    const applicationIds = new Set(existing
      .filter(row => row.entityType === 'application')
      .map(row => Number(row.entityId)));
    const invitationIds = new Set(existing
      .filter(row => row.entityType === 'invitation')
      .map(row => Number(row.entityId)));
    const [applications] = await connection.query(
      'SELECT applicationId FROM campaign_applications WHERE campaignId IN (?) FOR UPDATE',
      [campaignIds]
    );
    const [invitations] = await connection.query(
      'SELECT invitationId FROM campaign_invitations WHERE campaignId IN (?) FOR UPDATE',
      [campaignIds]
    );
    if (applications.some(row => !applicationIds.has(Number(row.applicationId)))
      || invitations.some(row => !invitationIds.has(Number(row.invitationId)))) {
      throw new Error('Refusing to transfer tagged campaigns because they contain unrelated activity');
    }
    const [campaigns] = await connection.query(
      'SELECT campaignId, businessId FROM campaigns WHERE campaignId IN (?) FOR UPDATE',
      [campaignIds]
    );
    if (campaigns.length !== campaignIds.length) {
      throw new Error('A tagged demo activity campaign is missing');
    }
    const campaignsReassigned = campaigns.filter(row => Number(row.businessId) !== Number(business.businessId)).length;
    if (campaignsReassigned) {
      await connection.query('UPDATE campaigns SET businessId = ? WHERE campaignId IN (?)', [business.businessId, campaignIds]);
      const taggedInvitationIds = [...invitationIds];
      if (taggedInvitationIds.length) {
        await connection.query(
          'UPDATE campaign_invitations SET invitedBy = ? WHERE invitationId IN (?)',
          [business.userId, taggedInvitationIds]
        );
      }
      const [campaignRecords] = await connection.query(
        "SELECT recordKey, provenance FROM demo_dataset_records WHERE namespace = ? AND entityType = 'campaign' FOR UPDATE",
        [NAMESPACE]
      );
      for (const campaignRecord of campaignRecords) {
        const provenance = typeof campaignRecord.provenance === 'string'
          ? JSON.parse(campaignRecord.provenance)
          : campaignRecord.provenance;
        await connection.query(
          'UPDATE demo_dataset_records SET provenance = ? WHERE namespace = ? AND recordKey = ?',
          [JSON.stringify({ ...provenance, businessId: business.businessId }), NAMESPACE, campaignRecord.recordKey]
        );
      }
    }
    return {
      campaignsCreated: 0,
      applicationsCreated: 0,
      invitationsCreated: 0,
      campaignsReassigned,
      alreadySeeded: true,
    };
  }

  const niches = await topSampleNiches(connection);
  const usedCreatorIds = new Set();
  let campaignsCreated = 0;
  let applicationsCreated = 0;
  let invitationsCreated = 0;

  for (const [index, plan] of CAMPAIGN_PLANS.entries()) {
    const niche = niches[index];
    const budget = validateCampaignBudget({
      totalBudget: plan.totalBudget,
      currency: 'KES',
      targetCreatorCount: plan.targetCreatorCount,
    });
    if (budget.error || budget.value.totalBudgetCents <= 0) {
      throw new Error(`Invalid demo campaign budget: ${budget.error || 'budget must be positive'}`);
    }
    if (plan.targetCreatorCount < 3 || plan.targetCreatorCount > 5) {
      throw new Error('Demo campaign creator slots must be between 3 and 5');
    }

    const invitationCount = index === 0 ? 1 : 0;
    const available = await matchingCreators(connection, niche, plan.targetCreatorCount + invitationCount + 20);
    const selected = available.filter(creator => !usedCreatorIds.has(Number(creator.creatorId)));
    if (selected.length < plan.targetCreatorCount + invitationCount) {
      throw new Error(`Not enough distinct dataset-sample creators match niche: ${niche}`);
    }
    const applicants = selected.slice(0, plan.targetCreatorCount);
    const invitee = invitationCount ? selected[plan.targetCreatorCount] : null;

    const [campaign] = await connection.query(
      `INSERT INTO campaigns
        (businessId, nicheText, targetAudience, budgetRange, preferredPlatforms,
         campaignGoal, totalBudget, currency, targetCreatorCount, publicationStatus)
       VALUES (?, ?, ?, ?, 'Instagram', 'Test creator application review workflow', ?, ?, ?, 'open')`,
      [
        business.businessId,
        `Demo marketplace activity: ${niche} creator partnership`,
        `Demo workflow audience interested in ${niche}.`,
        `KES ${plan.totalBudget.toLocaleString('en-US')}`,
        budget.value.totalBudget,
        budget.value.currency,
        plan.targetCreatorCount,
      ]
    );
    const campaignId = campaign.insertId;
    await record(connection, `campaign-${index + 1}`, 'campaign', campaignId, {
      businessId: business.businessId,
      niche,
      totalBudget: budget.value.totalBudget,
      currency: budget.value.currency,
      targetCreatorCount: plan.targetCreatorCount,
    });
    campaignsCreated += 1;

    for (const creator of applicants) {
      const creatorId = Number(creator.creatorId);
      const validationError = await validateCampaignApplication(connection, {
        campaignId,
        creatorId,
        applicantUserId: creator.userId,
      });
      if (validationError) {
        throw new Error(`Application validation failed for creator ${creatorId}: ${validationError.error}`);
      }
      const [application] = await connection.query(
        "INSERT INTO campaign_applications (campaignId, creatorId, applicationMessage, status) VALUES (?, ?, ?, 'pending')",
        [campaignId, creatorId, 'Demo dataset application for pending accept/reject workflow testing.']
      );
      await record(connection, `application-${campaignId}-${creatorId}`, 'application', application.insertId, {
        campaignId,
        creatorId,
        niche,
      });
      usedCreatorIds.add(creatorId);
      applicationsCreated += 1;
    }

    if (invitee) {
      const offeredCents = amountToCents(plan.invitationAmount);
      if (offeredCents === null || offeredCents <= 0 || offeredCents > budget.value.totalBudgetCents) {
        throw new Error('Demo invitation offer must be positive and within the campaign budget');
      }
      const [[filled]] = await connection.query(
        `SELECT COUNT(*) AS filledCreatorSlots FROM (
           SELECT creatorId FROM campaign_invitations WHERE campaignId = ? AND status = 'accepted'
           UNION
           SELECT creatorId FROM campaign_applications WHERE campaignId = ? AND status = 'accepted'
         ) accepted_creators`,
        [campaignId, campaignId]
      );
      if (Number(filled.filledCreatorSlots || 0) >= plan.targetCreatorCount) {
        throw new Error('Demo invitation would exceed the campaign creator slots');
      }
      const [[allocation]] = await connection.query(
        `SELECT COALESCE(SUM(offeredAmount), 0) AS allocatedBudget
         FROM campaign_invitations WHERE campaignId = ?
           AND (status = 'accepted' OR (status = 'pending' AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)))`,
        [campaignId]
      );
      if (Number(allocation.allocatedBudget || 0) + offeredCents / 100 > budget.value.totalBudget) {
        throw new Error('Demo invitation would exceed the remaining campaign budget');
      }
      const inviteeId = Number(invitee.creatorId);
      const [invitation] = await connection.query(
        `INSERT INTO campaign_invitations
          (campaignId, creatorId, invitedBy, invitationMessage, offeredAmount, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [campaignId, inviteeId, business.userId, 'Demo invitation for marketplace workflow testing.', offeredCents / 100]
      );
      await record(connection, `invitation-${campaignId}-${inviteeId}`, 'invitation', invitation.insertId, {
        campaignId,
        creatorId: inviteeId,
        offeredAmount: offeredCents / 100,
      });
      usedCreatorIds.add(inviteeId);
      invitationsCreated += 1;
    }
  }

  return { campaignsCreated, applicationsCreated, invitationsCreated, alreadySeeded: false };
}

async function run({ cleanupRequested = process.argv.includes('--cleanup') } = {}) {
  let connection;
  let transactionOpen = false;
  try {
    const args = process.argv.slice(2).filter(argument => argument !== '--cleanup');
    if (args.length || process.argv.filter(argument => argument === '--cleanup').length > 1) {
      throw new Error('Usage: node scripts/seedDemoMarketplaceActivity.js [--cleanup]');
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Demo marketplace activity cannot be seeded in production');
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionOpen = true;
    const counts = cleanupRequested ? await cleanup(connection) : await seed(connection);
    await connection.commit();
    transactionOpen = false;
    console.log(JSON.stringify({ namespace: NAMESPACE, ...counts }));
  } catch (error) {
    if (connection && transactionOpen) await connection.rollback();
    console.error(`Demo marketplace activity seed failed: ${error.code || error.message || 'database error'}`);
    process.exitCode = 1;
  } finally {
    connection?.release();
    await db.end();
  }
}

if (require.main === module) run();

module.exports = {
  NAMESPACE,
  CAMPAIGN_PLANS,
  topSampleNiches,
  isCompleteSeed,
  cleanup,
  run,
};
