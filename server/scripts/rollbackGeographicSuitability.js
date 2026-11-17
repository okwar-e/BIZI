'use strict';

const db = require('../config/db');

const columns = [
  ['campaigns', 'matchAudienceMarket'],
  ['campaigns', 'matchPhysicalLocation'],
  ['campaigns', 'targetMarket'],
  ['campaigns', 'campaignLocation'],
  ['creator_profiles', 'audienceLocationCoverageComplete'],
  ['creator_profiles', 'audienceLocationAsOf'],
  ['creator_profiles', 'audienceLocationSource'],
  ['creator_profiles', 'audienceLocations'],
];

async function rollback() {
  if (process.env.BIZI_CONFIRM_GEOGRAPHIC_ROLLBACK !== '1') {
    throw new Error('Set BIZI_CONFIRM_GEOGRAPHIC_ROLLBACK=1 to confirm dropping geographic fields and their data');
  }
  for (const [table, column] of columns) {
    const [existing] = await db.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1',
      [table, column]
    );
    if (existing.length) {
      await db.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
      console.log(`Dropped ${table}.${column}`);
    }
  }
  console.log('Geographic suitability rollback complete.');
}

if (require.main === module) {
  rollback()
    .catch(error => {
      console.error(`Geographic suitability rollback failed: ${error.code || error.message || 'database error'}`);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}

module.exports = { rollback };
