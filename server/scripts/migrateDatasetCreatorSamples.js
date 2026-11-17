'use strict';

const db = require('../config/db');

async function migrate() {
  const [duplicates] = await db.query(
    `SELECT creatorId FROM creator_profiles
     GROUP BY creatorId HAVING COUNT(*) > 1 LIMIT 1`
  );
  if (duplicates.length) {
    throw new Error('Resolve duplicate creator profiles before applying the unique profile index');
  }

  const columns = [
    ['followingCount', 'BIGINT UNSIGNED NULL'],
    ['postCount', 'BIGINT UNSIGNED NULL'],
  ];
  for (const [column, definition] of columns) {
    const [existing] = await db.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'creator_profiles' AND column_name = ?
       LIMIT 1`,
      [column]
    );
    if (!existing.length) {
      await db.query(`ALTER TABLE creator_profiles ADD COLUMN \`${column}\` ${definition}`);
      console.log(`Added creator_profiles.${column}`);
    }
  }

  const [index] = await db.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'creator_profiles'
       AND index_name = 'uq_creator_profiles_creator_id' LIMIT 1`
  );
  if (!index.length) {
    await db.query(
      'ALTER TABLE creator_profiles ADD UNIQUE INDEX uq_creator_profiles_creator_id (creatorId)'
    );
  }

  await db.query(
    `CREATE TABLE IF NOT EXISTS demo_dataset_records (
      namespace VARCHAR(64) NOT NULL,
      recordKey VARCHAR(128) NOT NULL,
      entityType VARCHAR(32) NOT NULL,
      entityId VARCHAR(64) NOT NULL,
      provenance JSON NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (namespace, recordKey),
      INDEX (entityType, entityId)
    ) ENGINE=InnoDB`
  );
  console.log('Dataset sample creator migration complete.');
}

if (require.main === module) {
  migrate()
    .catch(error => {
      console.error(`Dataset sample migration failed: ${error.code || error.message || 'database error'}`);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}

module.exports = { migrate };
