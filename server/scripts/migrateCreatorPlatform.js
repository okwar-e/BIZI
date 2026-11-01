'use strict';

const db = require('../config/db');

const columns = [
  ['campaigns', 'publicationStatus', "ENUM('draft','open','closed') NOT NULL DEFAULT 'draft'"],
  ['creator_profiles', 'bio', 'TEXT NULL'],
  ['creator_profiles', 'portfolioUrl', 'VARCHAR(2048) NULL'],
  ['creator_profiles', 'availability', "ENUM('available','limited','unavailable') NULL"],
  ['creator_profiles', 'preferences', 'JSON NULL'],
];

const tables = [
  `CREATE TABLE IF NOT EXISTS campaign_applications (
    applicationId BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    campaignId INT NOT NULL,
    creatorId INT NOT NULL,
    applicationMessage TEXT NULL,
    status ENUM('pending','accepted','rejected','withdrawn') NOT NULL DEFAULT 'pending',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_application_campaign_creator (campaignId, creatorId),
    INDEX idx_application_creator_status (creatorId, status),
    INDEX idx_application_campaign_status (campaignId, status),
    FOREIGN KEY (campaignId) REFERENCES campaigns(campaignId) ON DELETE CASCADE,
    FOREIGN KEY (creatorId) REFERENCES creators(creatorId) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS campaign_invitations (
    invitationId BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    campaignId INT NOT NULL,
    creatorId INT NOT NULL,
    invitedBy INT NOT NULL,
    invitationMessage TEXT NULL,
    status ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
    expiresAt TIMESTAMP NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    respondedAt TIMESTAMP NULL,
    INDEX idx_invitation_creator_status (creatorId, status),
    INDEX idx_invitation_campaign_creator (campaignId, creatorId),
    FOREIGN KEY (campaignId) REFERENCES campaigns(campaignId) ON DELETE CASCADE,
    FOREIGN KEY (creatorId) REFERENCES creators(creatorId) ON DELETE CASCADE,
    FOREIGN KEY (invitedBy) REFERENCES users(userId)
  ) ENGINE=InnoDB`,
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

  for (const statement of tables) await db.query(statement);

  const [pendingDuplicates] = await db.query(
    `SELECT campaignId, creatorId FROM campaign_invitations WHERE status = 'pending'
     GROUP BY campaignId, creatorId HAVING COUNT(*) > 1 LIMIT 1`
  );
  if (pendingDuplicates.length) {
    throw new Error('Resolve duplicate pending invitations before applying the pending-invitation uniqueness index');
  }
  const [pendingColumn] = await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
     AND table_name = 'campaign_invitations' AND column_name = 'pendingCreatorId' LIMIT 1`
  );
  if (!pendingColumn.length) {
    await db.query(
      `ALTER TABLE campaign_invitations ADD COLUMN pendingCreatorId INT
       GENERATED ALWAYS AS (CASE WHEN status = 'pending' THEN creatorId ELSE NULL END) STORED`
    );
  }
  const [uniqueIndex] = await db.query(
    `SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE()
     AND table_name = 'campaign_invitations' AND index_name = 'uq_pending_campaign_creator' LIMIT 1`
  );
  if (!uniqueIndex.length) {
    await db.query('ALTER TABLE campaign_invitations ADD UNIQUE INDEX uq_pending_campaign_creator (campaignId, pendingCreatorId)');
  }
  console.log('Creator-platform migration complete. Existing campaigns remain drafts until their owner opens them.');
}

if (require.main === module) {
  migrate()
    .catch(error => {
      console.error(`Creator-platform migration failed: ${error.code || 'database error'}`);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}

module.exports = { migrate };