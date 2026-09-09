const { getEmbedding, cosineSimilarity } = require('./embeddingService');

const WEIGHTS = { semantic: 0.5, rules: 0.5 };

function roundScore(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round((value * factor) + Number.EPSILON) / factor;
}

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

function semanticScore(campaign, creatorProfile) {
  if (!campaign.nicheEmbedding || !creatorProfile.nicheEmbedding) {
    console.warn('Semantic score fallback: stored embedding is missing');
    return 0.5;
  }

  try {
    const campaignEmbedding = JSON.parse(campaign.nicheEmbedding);
    const creatorEmbedding = JSON.parse(creatorProfile.nicheEmbedding);
    const cosineSim = cosineSimilarity(campaignEmbedding, creatorEmbedding);

    return roundScore((cosineSim + 1) / 2);
  } catch (error) {
    console.warn(`Semantic score fallback: ${error.message}`);
    return 0.5;
  }
}

function ruleScore(campaign, creatorProfile) {
  const engagementRate = creatorProfile.verifiedEngagement
    ?? creatorProfile.selfReportedEngagement
    ?? 2.0;
  const engagementScore = Math.min(engagementRate / 10, 1);
  // Placeholder heuristic until budget-to-follower tiers are formally defined.
  const followerScore = creatorProfile.followerCount > 0 ? 0.7 : 0.3;

  return roundScore((0.6 * engagementScore) + (0.4 * followerScore));
}

async function generateRecommendations(campaign, creatorProfiles) {
  const filteredProfiles = hardConstraintFilter(campaign, creatorProfiles);
  const scoredProfiles = await Promise.all(
    filteredProfiles.map(async (creatorProfile) => {
      const semanticScoreValue = await semanticScore(campaign, creatorProfile);
      const ruleScoreValue = ruleScore(campaign, creatorProfile);
      const finalScore = (WEIGHTS.semantic * semanticScoreValue)
        + (WEIGHTS.rules * ruleScoreValue);

      return {
        profileId: creatorProfile.profileId,
        semanticScore: semanticScoreValue,
        ruleScore: ruleScoreValue,
        finalScore,
      };
    })
  );

  return scoredProfiles
    .sort((profileA, profileB) => profileB.finalScore - profileA.finalScore)
    .slice(0, 5)
    .map((profile) => ({
      profileId: profile.profileId,
      semanticScore: roundScore(profile.semanticScore),
      ruleScore: roundScore(profile.ruleScore),
      finalScore: roundScore(profile.finalScore),
    }));
}

module.exports = {
  WEIGHTS,
  roundScore,
  hardConstraintFilter,
  semanticScore,
  ruleScore,
  generateRecommendations,
};

if (require.main === module) {
  const campaign = {
    nicheText: 'Fitness and wellness products for young adults',
    targetAudience: 'University students aged 18-25 interested in fitness',
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
    {
      profileId: 4,
      niche: 'Workout programs and activewear',
      audienceDescription: 'Fitness-focused young professionals',
      verifiedEngagement: 5,
      followerCount: 8000,
      platforms: 'Instagram, TikTok',
      location: 'Nairobi',
    },
    {
      profileId: 5,
      niche: 'Healthy food and nutrition',
      audienceDescription: 'Young adults interested in wellness and healthy living',
      selfReportedEngagement: 3,
      followerCount: 1200,
      platforms: 'TikTok',
      location: 'Nairobi',
    },
  ];

  console.log(hardConstraintFilter(campaign, creatorProfiles));
  console.log(creatorProfiles.map((creatorProfile) => ruleScore(campaign, creatorProfile)));

  const roundingCheck = roundScore(0.5 * 0.879 + 0.5 * 0.58, 3);
  console.log(
    roundingCheck === 0.73
      ? 'Rounding check PASS: 0.7295 rounds to 0.730'
      : `Rounding check FAIL: expected 0.73, received ${roundingCheck}`
  );

  if (process.env.RUN_SEMANTIC_TEST !== 'true') {
    return;
  }

  Promise.all([
    getEmbedding(`${campaign.nicheText} ${campaign.targetAudience}`),
    ...creatorProfiles.map((creatorProfile) =>
      getEmbedding(`${creatorProfile.niche} ${creatorProfile.audienceDescription}`)
    ),
  ])
    .then(([campaignEmbedding, ...creatorEmbeddings]) => {
      campaign.nicheEmbedding = JSON.stringify(campaignEmbedding);
      creatorProfiles.forEach((creatorProfile, index) => {
        creatorProfile.nicheEmbedding = JSON.stringify(creatorEmbeddings[index]);
      });

      return generateRecommendations(campaign, creatorProfiles);
    })
    .then((recommendations) => {
      console.log(recommendations);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
