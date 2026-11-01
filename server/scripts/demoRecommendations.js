const db = require('../config/db');
const { generateRecommendations } = require('../services/recommendationEngine');

const campaignIds = [3, 9, 17];

function printCampaignHeader(campaign) {
  console.log('='.repeat(60));
  console.log(
    `CAMPAIGN: ${campaign.nicheText} (${campaign.location}, ${campaign.preferredPlatforms})`
  );
  console.log('='.repeat(60));
}

async function getCampaign(campaignId) {
  const [rows] = await db.query(
    `SELECT campaignId, nicheText, targetAudience, preferredPlatforms, location, nicheEmbedding
     FROM campaigns
     WHERE campaignId = ?
     LIMIT 1`,
    [campaignId]
  );

  return rows[0] || null;
}

async function getCreatorProfiles() {
  const [rows] = await db.query(
    `SELECT
       cp.profileId,
       cp.niche,
       cp.audienceDescription,
       cp.platforms,
       cp.location,
       cp.selfReportedEngagement,
       cp.verifiedEngagement,
       cp.followerCount,
       cp.nicheEmbedding,
       c.publicHandle
     FROM creator_profiles cp
     JOIN creators c ON c.creatorId = cp.creatorId`
  );

  return rows;
}

async function demoRecommendations() {
  const creatorProfiles = await getCreatorProfiles();

  for (const campaignId of campaignIds) {
    const campaign = await getCampaign(campaignId);

    if (!campaign) {
      console.log(`Campaign ${campaignId} was not found.`);
      continue;
    }

    printCampaignHeader(campaign);
    const recommendations = await generateRecommendations(campaign, creatorProfiles);

    if (recommendations.length === 0) {
      console.log(
        'No creators passed hard-constraint filtering for this campaign - demonstrating the system correctly avoids false-positive matches.'
      );
      console.log();
      continue;
    }

    const profilesById = new Map(
      creatorProfiles.map((creatorProfile) => [creatorProfile.profileId, creatorProfile])
    );

    recommendations.forEach((recommendation, index) => {
      const creatorProfile = profilesById.get(recommendation.profileId);
      console.log(`Rank ${index + 1}: ${creatorProfile.publicHandle} (${creatorProfile.niche})`);
      console.log(
        `  Semantic Match: ${Math.round(recommendation.semanticScore * 100)}%  | `
        + `Engagement/Followers: ${Math.round(recommendation.ruleScore * 100)}%  | `
        + `Overall: ${Math.round(recommendation.finalScore * 100)}%`
      );
      console.log(`  "${recommendation.explanationText}"`);
      console.log();
    });
  }
}

if (require.main === module) {
  demoRecommendations()
    .catch((error) => {
      console.error(`Demo failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.end();
    });
}

module.exports = {
  demoRecommendations,
};
