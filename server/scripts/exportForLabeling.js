const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const dataDirectory = path.join(__dirname, '..', 'data');

async function exportForLabeling() {
  await fs.mkdir(dataDirectory, { recursive: true });

  const [campaigns] = await db.query(
    `SELECT campaignId, nicheText, targetAudience, budgetRange, preferredPlatforms, location
     FROM campaigns
     WHERE campaignId NOT IN (1, 2)
     ORDER BY campaignId`
  );

  const [creators] = await db.query(
    `SELECT
       cp.profileId,
       cp.niche,
       cp.audienceDescription,
       cp.platforms,
       cp.location,
       cp.selfReportedEngagement,
       cp.followerCount,
       c.publicHandle
     FROM creator_profiles cp
     JOIN creators c ON c.creatorId = cp.creatorId
     ORDER BY cp.profileId`
  );

  const groundTruthTemplate = campaigns.map((campaign) => ({
    campaignId: campaign.campaignId,
    nicheText: campaign.nicheText,
    goodMatchProfileIds: [],
  }));

  const files = [
    ['campaigns_for_labeling.json', campaigns],
    ['creators_for_labeling.json', creators],
    ['ground_truth_template.json', groundTruthTemplate],
  ];

  for (const [fileName, contents] of files) {
    const filePath = path.join(dataDirectory, fileName);
    await fs.writeFile(filePath, `${JSON.stringify(contents, null, 2)}\n`, 'utf8');
    console.log(`Created ${filePath}`);
  }

  console.log(`Export complete: ${campaigns.length} campaigns and ${creators.length} creators.`);
}

if (require.main === module) {
  exportForLabeling()
    .catch((error) => {
      console.error(`Export failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.end();
    });
}

module.exports = {
  exportForLabeling,
};
