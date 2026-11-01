'use strict';

const { recommendCreators, MlServiceError } = require('../services/mlRecommendationService');
const { explainMlRecommendation } = require('../services/groundedAssistant');

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

      const recommendations = await recommend(business, requestedTopN);
      const explainedRecommendations = recommendations.map(recommendation => ({
        ...recommendation,
        explanation: explainMlRecommendation({ business, campaign, recommendation }),
      }));
      return res.status(200).json({
        catalog: 'bizi_model_export',
        scoreLabel: 'Recommendation Score',
        scoreMeaning: 'Ranking score only; not a probability of campaign success or ROI.',
        creatorIdentity: 'creator_username is an ML catalog identity and is not linked to a Bizi creator account.',
        campaignRequirements: {
          business,
          targetAudience: campaign.targetAudience || null,
          campaignGoal: campaign.campaignGoal || null,
          preferredPlatforms: campaign.preferredPlatforms || null,
          location: campaign.location || null,
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

module.exports = { createRouter };