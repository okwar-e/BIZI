const { getEmbedding, cosineSimilarity } = require('./embeddingService');

function splitValues(value) {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function hardConstraintFilter(campaign, creatorProfiles) {
  const campaignPlatforms = splitValues(campaign.preferredPlatforms);
  const campaignLocation = typeof campaign.location === 'string'
    ? campaign.location.trim().toLowerCase()
    : '';

  return creatorProfiles.filter((creatorProfile) => {
    const creatorPlatforms = splitValues(creatorProfile.platforms);
    const hasPlatformOverlap = creatorPlatforms.some((platform) =>
      campaignPlatforms.includes(platform)
    );

    if (!hasPlatformOverlap) {
      return false;
    }

    if (campaignLocation) {
      const creatorLocation = typeof creatorProfile.location === 'string'
        ? creatorProfile.location.trim().toLowerCase()
        : '';

      if (creatorLocation !== campaignLocation) {
        return false;
      }
    }

    // Budget filtering is deferred because budget-to-engagement mapping is not defined yet.
    return true;
  });
}

async function semanticScore(campaign, creatorProfile) {
  const campaignEmbedding = await getEmbedding(campaign.nicheText);
  const creatorText = [creatorProfile.niche, creatorProfile.audienceDescription]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
  const creatorEmbedding = await getEmbedding(creatorText);
  const cosineSim = cosineSimilarity(campaignEmbedding, creatorEmbedding);

  return (cosineSim + 1) / 2;
}

function ruleScore(campaign, creatorProfile) {
  const engagementRate = creatorProfile.verifiedEngagement
    ?? creatorProfile.selfReportedEngagement
    ?? 2.0;
  const engagementScore = Math.min(engagementRate / 10, 1);
  // Placeholder heuristic until budget-to-follower tiers are formally defined.
  const followerScore = creatorProfile.followerCount > 0 ? 0.7 : 0.3;

  return (0.6 * engagementScore) + (0.4 * followerScore);
}

module.exports = {
  hardConstraintFilter,
  semanticScore,
  ruleScore,
};

if (require.main === module) {
  const campaign = {
    nicheText: 'Fitness and wellness products for young adults',
    preferredPlatforms: 'TikTok, Instagram',
    location: 'Nairobi',
    budgetRange: 'KES 30000-50000',
  };

  const creatorProfiles = [
    {
      profileId: 1,
      niche: 'Fitness and wellness products',
      audienceDescription: 'Young adults interested in health and exercise',
      verifiedEngagement: 8,
      followerCount: 15000,
      platforms: 'YouTube, TikTok',
      location: 'nairobi',
    },
    {
      profileId: 2,
      niche: 'Home gardening tools',
      audienceDescription: 'People interested in plants and landscaping',
      selfReportedEngagement: 4,
      followerCount: 0,
      platforms: 'YouTube, Facebook',
      location: 'Nairobi',
    },
    {
      profileId: 3,
      niche: 'Fitness and wellness products',
      audienceDescription: 'Young adults interested in health and exercise',
      verifiedEngagement: null,
      selfReportedEngagement: null,
      followerCount: null,
      platforms: 'Instagram',
      location: 'Mombasa',
    },
  ];

  console.log(hardConstraintFilter(campaign, creatorProfiles));
  console.log(creatorProfiles.map((creatorProfile) => ruleScore(campaign, creatorProfile)));

  if (process.env.RUN_SEMANTIC_TEST !== 'true') {
    return;
  }

  Promise.all([
    semanticScore(campaign, creatorProfiles[0]),
    semanticScore(campaign, creatorProfiles[1]),
  ])
    .then(([matchingScore, unrelatedScore]) => {
      console.log({ matchingScore, unrelatedScore });
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
