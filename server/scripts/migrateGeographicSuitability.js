'use strict';

const db = require('../config/db');

const columns = [
  ['creator_profiles', 'audienceLocations', 'TEXT NULL'],
  ['creator_profiles', 'audienceLocationSource', 'VARCHAR(500) NULL'],
  ['creator_profiles', 'audienceLocationAsOf', 'DATE NULL'],
  ['creator_profiles', 'audienceLocationCoverageComplete', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['campaigns', 'campaignLocation', 'VARCHAR(255) NULL'],
  ['campaigns', 'targetMarket', 'VARCHAR(255) NULL'],
  ['campaigns', 'matchPhysicalLocation', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['campaigns', 'matchAudienceMarket', 'BOOLEAN NOT NULL DEFAULT FALSE'],
];

async function migrate() {
  for (const [table, column, definition] of columns) {
    const [existing] = await db.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1',
      [table, column]
    );
    if (!existing.length) {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`Added ${table}.${column}`);
    }
  }
  console.log('Geographic suitability migration complete. Existing location fields were not backfilled.');
}

if (require.main === module) {
  migrate()
    .catch(error => {
      console.error(`Geographic suitability migration failed: ${error.code || error.message || 'database error'}`);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}

module.exports = { migrate };
