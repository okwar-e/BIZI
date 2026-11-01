'use strict';

const db = require('../config/db');

const columns = [
  ['campaigns', 'totalBudget', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00'],
  ['campaigns', 'currency', "CHAR(3) NOT NULL DEFAULT 'KES'"],
  ['campaigns', 'targetCreatorCount', 'INT UNSIGNED NOT NULL DEFAULT 1'],
  ['campaign_invitations', 'offeredAmount', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00'],
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
  console.log('Campaign budget and offer migration complete.');
}

if (require.main === module) {
  migrate()
    .catch(error => {
      console.error(`Campaign budget migration failed: ${error.code || error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}

module.exports = { migrate };