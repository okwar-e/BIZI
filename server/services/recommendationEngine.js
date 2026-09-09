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

module.exports = {
  hardConstraintFilter,
};

if (require.main === module) {
  const campaign = {
    preferredPlatforms: 'TikTok, Instagram',
    location: 'Nairobi',
    budgetRange: 'KES 30000-50000',
  };

  const creatorProfiles = [
    {
      profileId: 1,
      platforms: 'YouTube, TikTok',
      location: 'nairobi',
    },
    {
      profileId: 2,
      platforms: 'YouTube, Facebook',
      location: 'Nairobi',
    },
    {
      profileId: 3,
      platforms: 'Instagram',
      location: 'Mombasa',
    },
  ];

  console.log(hardConstraintFilter(campaign, creatorProfiles));
}
