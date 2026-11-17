'use strict';

const db = require('../config/db');
const { NAMESPACE } = require('./seedDatasetCreatorSamples');

async function rollback() {
  const [outsideSampleValues] = await db.query(
    `SELECT COUNT(*) AS count
     FROM creator_profiles p
     WHERE (p.followingCount IS NOT NULL OR p.postCount IS NOT NULL)
       AND NOT EXISTS (
         SELECT 1 FROM demo_dataset_records r
         WHERE r.namespace = ? AND r.entityType = 'creator'
           AND CAST(r.entityId AS UNSIGNED) = p.creatorId
       )`,
    [NAMESPACE]
  );
  if (Number(outsideSampleValues[0].count) > 0) {
    throw new Error('Refusing to drop sample feature columns because non-sample profiles use them');
  }

  const [samples] = await db.query(
    `SELECT c.creatorId, c.userId, p.profileId
     FROM demo_dataset_records r
     JOIN creators c ON c.creatorId = CAST(r.entityId AS UNSIGNED)
     JOIN creator_profiles p ON p.creatorId = c.creatorId
     WHERE r.namespace = ? AND r.entityType = 'creator'`,
    [NAMESPACE]
  );
  const creatorIds = samples.map(sample => sample.creatorId);
  const profileIds = samples.map(sample => sample.profileId);
  const userIds = [...new Set(samples.map(sample => sample.userId))];

  const references = [
    ['campaign_applications', 'creatorId', creatorIds],
    ['campaign_invitations', 'creatorId', creatorIds],
    ['creator_recommendation_evidence', 'profileId', profileIds],
    ['recommendation_events_v1', 'profileId', profileIds],
  ];
  for (const [table, column, ids] of references) {
    if (!ids.length) continue;
    const [exists] = await db.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table]
    );
    if (!exists.length) continue;
    const [rows] = await db.query(
      `SELECT 1 FROM \`${table}\` WHERE \`${column}\` IN (?) LIMIT 1`,
      [ids]
    );
    if (rows.length) throw new Error(`Refusing rollback because dataset samples have records in ${table}`);
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.query('DELETE FROM demo_dataset_records WHERE namespace = ?', [NAMESPACE]);
    if (userIds.length) {
      await connection.query('DELETE FROM users WHERE userId IN (?)', [userIds]);
    }
    await connection.commit();
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    connection?.release();
  }

  const [index] = await db.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'creator_profiles'
       AND index_name = 'uq_creator_profiles_creator_id' LIMIT 1`
  );
  if (index.length) {
    await db.query('ALTER TABLE creator_profiles DROP INDEX uq_creator_profiles_creator_id');
  }
  for (const column of ['followingCount', 'postCount']) {
    const [existing] = await db.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'creator_profiles' AND column_name = ?
       LIMIT 1`,
      [column]
    );
    if (existing.length) await db.query(`ALTER TABLE creator_profiles DROP COLUMN \`${column}\``);
  }
  console.log(JSON.stringify({ namespace: NAMESPACE, removedSampleAccounts: userIds.length, schemaReverted: true }));
}

if (require.main === module) {
  rollback()
    .catch(error => {
      console.error(`Dataset sample rollback failed: ${error.code || error.message || 'database error'}`);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}

module.exports = { rollback };
