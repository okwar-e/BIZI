const db = require('../config/db');
const { creators } = require('./seedTestData');
const { updateSelfReportedMetrics } = require('../models/creatorProfileModel');

async function backfillSeedMetrics() {
  let updated = 0;

  for (let index = 0; index < creators.length; index += 1) {
    const creatorNumber = index + 1;
    const [rows] = await db.query(
      `SELECT c.creatorId
       FROM creators c
       JOIN users u ON u.userId = c.userId
       WHERE u.email = ?
       LIMIT 1`,
      [`creator${creatorNumber}@synthetic.test`]
    );

    if (rows.length === 0) {
      console.warn(`Skipped creator ${creatorNumber}: seeded user not found`);
      continue;
    }

    const affectedRows = await updateSelfReportedMetrics(rows[0].creatorId, {
      selfReportedEngagement: creators[index].selfReportedEngagement,
      followerCount: creators[index].followerCount,
    });

    if (affectedRows > 0) {
      updated += 1;
    }

    console.log(`Backfilled creator ${creatorNumber}/${creators.length}...`);
  }

  console.log(`Backfill complete: ${updated} creator profiles updated.`);
}

if (require.main === module) {
  backfillSeedMetrics()
    .catch((error) => {
      console.error(`Backfill failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.end();
    });
}

module.exports = {
  backfillSeedMetrics,
};