'use strict';

const { recommendCreators, MlServiceError } = require('../services/mlRecommendationService');
const { explainMlRecommendation } = require('../services/groundedAssistant');
const { sanitizeContactDetails } = require('../services/creatorBio');

async function loadCreatorCandidates(db) {
  const [creatorCandidates] = await db.query(
    `SELECT c.creatorId AS creator_id,
            COALESCE(NULLIF(TRIM(c.publicHandle), ''), CONCAT('creator-', c.creatorId)) AS creator_username,
            u.name AS creator_display_name, p.followerCount AS creator_followers,
            p.followingCount AS creator_following, p.postCount AS creator_post_count,
            NULL AS creator_website, p.niche AS creator_category,
            COALESCE(NULLIF(TRIM(p.bio), ''), NULLIF(TRIM(p.audienceDescription), '')) AS creator_bio,
            EXISTS (
              SELECT 1 FROM demo_dataset_records d
              WHERE d.namespace = 'bizi-dataset-samples-v1' AND d.entityType = 'creator'
                AND CAST(d.entityId AS UNSIGNED) = c.creatorId
            ) AS is_sample_account
     FROM creators c
     JOIN users u ON u.userId = c.userId AND u.role = 'creator'
     JOIN creator_profiles p ON p.creatorId = c.creatorId
     WHERE NULLIF(TRIM(p.niche), '') IS NOT NULL
       AND COALESCE(NULLIF(TRIM(p.bio), ''), NULLIF(TRIM(p.audienceDescription), '')) IS NOT NULL
     ORDER BY c.creatorId
     LIMIT 5000`
  );
  return creatorCandidates.map(creator => ({
    ...creator,
    is_sample_account: Boolean(creator.is_sample_account),
  }));
}

async function warmRecommendationCache(db, fetchImpl = fetch) {
  const serviceUrl = (process.env.BIZI_ML_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
  const creators = await loadCreatorCandidates(db);
  if (!creators.length) return;

  let lastError;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetchImpl(`${serviceUrl}/warmup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creators }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) return;
      lastError = new Error(`Warmup returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw lastError || new Error('Recommendation service warmup failed');
}

function createRouter({ express, db, verifyToken, requireRole, recommend = recommendCreators }) {
  const router = express.Router();

  router.post('/:campaignId/ml-recommendations', verifyToken, requireRole('business'), async (req, res) => {
    const campaignId = Number(req.params.campaignId);
    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return res.status(400).json({ error: 'Invalid campaign id' });
    }

    const requestedTopN = req.query.top_n === undefined ? 10 : Number(req.query.top_n);
    if (!Number.isInteger(requestedTopN) || requestedTopN < 1 || requestedTopN > 100) {
      return res.status(400).json({ error: 'top_n must be an integer between 1 and 100' });
    }

    try {
      const [rows] = await db.query(
        `SELECT c.*, b.businessName, b.industry
         FROM campaigns c
         JOIN businesses b ON b.businessId = c.businessId
         WHERE c.campaignId = ? AND b.userId = ?
         LIMIT 1`,
        [campaignId, req.user.userId]
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaign = rows[0];
      if (campaign.publicationStatus !== 'open') {
        return res.status(409).json({ error: 'Open the campaign before requesting creator recommendations' });
      }
      const brief = typeof campaign.nicheText === 'string' ? campaign.nicheText.trim() : '';
      const industry = typeof campaign.industry === 'string' ? campaign.industry.trim() : '';
      const business = {
        name: typeof campaign.businessName === 'string' ? campaign.businessName.trim() : '',
        category: industry || brief,
        description: brief,
      };
      if (!business.name || !business.category || !business.description) {
        return res.status(400).json({ error: 'Business name, category, and campaign brief are required' });
      }

      const creatorCandidates = await loadCreatorCandidates(db);
      const recommendations = creatorCandidates.length
        ? await recommend(business, requestedTopN, undefined, {
          creators: creatorCandidates,
        })
        : [];
      const usesCreatorAccounts = creatorCandidates.length > 0;
      const explainedRecommendations = recommendations.map(recommendation => {
        const safeRecommendation = {
          ...recommendation,
          creator_bio: sanitizeContactDetails(recommendation.creator_bio),
        };
        return { ...safeRecommendation, explanation: explainMlRecommendation({ business, campaign, recommendation: safeRecommendation }) };
      });
      return res.status(200).json({
        catalog: 'bizi_creator_accounts',
        scoreLabel: 'Recommendation Score',
        scoreMeaning: 'Ranking score only; not a probability of campaign success or ROI.',
        creatorIdentity: usesCreatorAccounts
          ? 'Candidates are creator accounts stored in Bizi. Dataset-derived accounts are test accounts and can be invited for workflow validation, but are not real creator identities.'
          : 'No eligible creator accounts with usable profile text are currently available.',
        campaignRequirements: {
          business,
          targetAudience: campaign.targetAudience || null,
          campaignGoal: campaign.campaignGoal || null,
          preferredPlatforms: campaign.preferredPlatforms || null,
          location: campaign.location || null,
          campaignLocation: campaign.campaignLocation || null,
          targetMarket: campaign.targetMarket || null,
          matchPhysicalLocation: Boolean(campaign.matchPhysicalLocation),
          matchAudienceMarket: Boolean(campaign.matchAudienceMarket),
          budgetRange: campaign.budgetRange || null,
        },
        recommendations: explainedRecommendations,
      });
    } catch (error) {
      if (error instanceof MlServiceError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Unable to generate recommendations' });
    }
  });

  return router;
}

module.exports = { createRouter, loadCreatorCandidates, warmRecommendationCache };