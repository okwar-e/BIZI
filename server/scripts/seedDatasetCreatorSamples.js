'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { sanitizeContactDetails } = require('../services/creatorBio');

const NAMESPACE = 'bizi-dataset-samples-v1';
const CATALOG_PATH = path.join(__dirname, '../Bizi_model_export/creator_profiles.csv');
const REQUIRED_COLUMNS = [
  'creator_username',
];
const COUNT_COLUMNS = {
  creator_followers: { field: 'followers', minimum: 500, maximum: 50000 },
  creator_following: { field: 'following', minimum: 100, maximum: 10000 },
  creator_post_count: { field: 'postCount', minimum: 5, maximum: 1000 },
};

function countValue(value, column, username) {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return { value: parsed, synthetic: false };
    throw new Error(`Creator catalogue has an invalid ${column}`);
  }
  const { minimum, maximum } = COUNT_COLUMNS[column];
  const digest = crypto.createHash('sha256').update(`${username}:${column}`).digest();
  return {
    value: minimum + (digest.readUInt32BE(0) % (maximum - minimum + 1)),
    synthetic: true,
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('Creator catalogue contains an unterminated quoted field');
  if (field.length || row.length) {
    row.push(field);
    if (row.some(value => value.length > 0)) rows.push(row);
  }
  if (rows.length < 2) throw new Error('Creator catalogue contains no data rows');

  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim()
  );
  if (new Set(headers).size !== headers.length) throw new Error('Creator catalogue has duplicate columns');
  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`Creator catalogue row ${index + 2} has an unexpected number of columns`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}

function parseDatasetRows(text) {
  const sourceRows = parseCsv(text);
  const usernames = new Set();
  return sourceRows.map((row, index) => {
    for (const column of REQUIRED_COLUMNS) {
      if (typeof row[column] !== 'string' || !row[column].trim()) {
        throw new Error(`Creator catalogue row ${index + 2} is missing ${column}`);
      }
    }
    const username = row.creator_username.trim();
    if (usernames.has(username)) throw new Error(`Creator catalogue contains a duplicate source identifier at row ${index + 2}`);
    usernames.add(username);

    const sourceHash = crypto.createHash('sha256').update(username).digest('hex');
    const counts = {};
    const syntheticFields = [];
    for (const [column, { field }] of Object.entries(COUNT_COLUMNS)) {
      const parsed = countValue(row[column], column, username);
      counts[field] = parsed.value;
      if (parsed.synthetic) syntheticFields.push(column);
    }
    const textOrSynthetic = (column, fallback) => {
      const value = typeof row[column] === 'string' ? row[column].trim() : '';
      if (value) return value;
      syntheticFields.push(column);
      return fallback;
    };
    const displayName = textOrSynthetic('creator_display_name', `Dataset test creator ${sourceHash.slice(0, 8)}`);
    const category = textOrSynthetic('creator_category', 'General creator');
    const bio = sanitizeContactDetails(textOrSynthetic(
      'creator_bio',
      `Synthetic test profile for ${category} content (${sourceHash.slice(0, 8)}).`
    ));
    return {
      sourceOrder: index,
      username,
      displayName,
      category,
      bio,
      audienceDescription: `Synthetic test audience profile for ${category} content (${sourceHash.slice(0, 8)}).`,
      ...counts,
      syntheticFields,
      email: `dataset-${sourceHash.slice(0, 24)}@sample.invalid`,
      handle: `SAMPLE_${sourceHash.slice(0, 20).toUpperCase()}`,
    };
  });
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function rowsForValues(connection, sql, values, chunkSize = 250) {
  const rows = [];
  for (const part of chunks(values, chunkSize)) {
    const [found] = await connection.query(sql, [part]);
    rows.push(...found);
  }
  return rows;
}

async function run() {
  let connection;
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Dataset test accounts must not be seeded into a production environment');
    }
    const samplePassword = process.env.BIZI_DATASET_SAMPLE_PASSWORD;
    if (typeof samplePassword !== 'string' || samplePassword.length < 12) {
      throw new Error('Set BIZI_DATASET_SAMPLE_PASSWORD to a local password of at least 12 characters');
    }
    const records = parseDatasetRows(fs.readFileSync(CATALOG_PATH, 'utf8'));
    const passwordHash = await bcrypt.hash(samplePassword, 12);
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT r.recordKey, r.entityType, r.entityId, c.userId, u.email, u.role,
              p.profileId
       FROM demo_dataset_records r
       LEFT JOIN creators c ON c.creatorId = CAST(r.entityId AS UNSIGNED)
       LEFT JOIN users u ON u.userId = c.userId
       LEFT JOIN creator_profiles p ON p.creatorId = c.creatorId
       WHERE r.namespace = ?`,
      [NAMESPACE]
    );
    const existing = new Map();
    for (const record of existingRows) {
      if (record.entityType !== 'creator') {
        throw new Error('Dataset sample provenance contains an unexpected entity type');
      }
      if (existing.has(record.recordKey)) {
        throw new Error('Dataset sample provenance contains a duplicate source record');
      }
      if (!record.userId || record.role !== 'creator') {
        throw new Error('A dataset sample account is missing or has an unexpected role');
      }
      existing.set(record.recordKey, record);
    }

    const missing = records.filter(record => !existing.has(record.username));
    for (const part of chunks(missing, 250)) {
      const emails = part.map(record => record.email);
      const [emailConflicts] = await connection.query(
        `SELECT email FROM users WHERE email IN (${emails.map(() => '?').join(',')})`,
        emails
      );
      if (emailConflicts.length) throw new Error('A generated sample email already belongs to another account');

      const handles = part.map(record => record.handle);
      const [handleConflicts] = await connection.query(
        `SELECT publicHandle FROM creators WHERE publicHandle IN (${handles.map(() => '?').join(',')})`,
        handles
      );
      if (handleConflicts.length) throw new Error('A generated sample handle already belongs to another creator');

      await connection.query(
        'INSERT INTO users (name, email, passwordHash, role) VALUES ?',
        [part.map(record => [record.displayName, record.email, passwordHash, 'creator'])]
      );
      const users = await rowsForValues(
        connection,
        'SELECT userId, email FROM users WHERE email IN (?)',
        emails
      );
      const userIds = new Map(users.map(user => [user.email, user.userId]));
      if (userIds.size !== part.length) throw new Error('Could not resolve every dataset sample account');

      await connection.query(
        'INSERT INTO creators (userId, publicHandle, verificationStatus) VALUES ?',
        [part.map(record => [userIds.get(record.email), record.handle, 'unverified'])]
      );
    }

    const allEmails = records.map(record => record.email);
    const allUsers = await rowsForValues(
      connection,
      'SELECT userId, email FROM users WHERE email IN (?)',
      allEmails
    );
    const userIds = new Map(allUsers.map(user => [user.email, user.userId]));
    if (userIds.size !== records.length) throw new Error('The dataset sample account set is incomplete');

    const userIdValues = [...userIds.values()];
    const creators = await rowsForValues(
      connection,
      'SELECT creatorId, userId FROM creators WHERE userId IN (?)',
      userIdValues
    );
    const creatorsByUserId = new Map(creators.map(creator => [creator.userId, creator.creatorId]));
    if (creators.length !== records.length || creatorsByUserId.size !== records.length) {
      throw new Error('A dataset sample account does not have exactly one creator profile');
    }

    const profileRows = [];
    const provenanceRows = [];
    for (const record of records) {
      const creatorId = creatorsByUserId.get(userIds.get(record.email));
      const previous = existing.get(record.username);
      if (previous && Number(previous.entityId) !== Number(creatorId)) {
        throw new Error('Dataset sample provenance points to a different creator account');
      }
      if (previous && previous.email !== record.email) {
        throw new Error('Dataset sample provenance does not match its reserved sample account');
      }
      profileRows.push([
        creatorId,
        record.category,
        record.bio,
        record.audienceDescription,
        record.followers,
        record.following,
        record.postCount,
      ]);
      provenanceRows.push([
        NAMESPACE,
        record.username,
        'creator',
        String(creatorId),
        JSON.stringify({
          dataOrigin: 'dataset_test_account',
          source: 'Bizi_model_export/creator_profiles.csv',
          sourceOrder: record.sourceOrder,
          testAccount: true,
          registeredCreator: true,
          syntheticFields: [...record.syntheticFields, 'audienceDescription'],
        }),
      ]);
    }

    for (const part of chunks(records, 250)) {
      await connection.query(
        `UPDATE users SET passwordHash = ? WHERE email IN (${part.map(() => '?').join(',')})`,
        [passwordHash, ...part.map(record => record.email)]
      );
      await connection.query(
        `UPDATE users SET name = CASE email ${part.map(() => 'WHEN ? THEN ?').join(' ')} END
         WHERE email IN (${part.map(() => '?').join(',')})`,
        [...part.flatMap(record => [record.email, record.displayName]), ...part.map(record => record.email)]
      );
      await connection.query(
        `UPDATE creators c JOIN users u ON u.userId = c.userId
         SET c.publicHandle = CASE u.email ${part.map(() => 'WHEN ? THEN ?').join(' ')} END,
             c.verificationStatus = 'unverified'
         WHERE u.email IN (${part.map(() => '?').join(',')})`,
        [...part.flatMap(record => [record.email, record.handle]), ...part.map(record => record.email)]
      );
    }

    for (const part of chunks(profileRows, 250)) {
      await connection.query(
        `INSERT INTO creator_profiles
          (creatorId, niche, bio, audienceDescription, followerCount, followingCount, postCount)
         VALUES ?
         ON DUPLICATE KEY UPDATE niche = VALUES(niche), bio = VALUES(bio),
           audienceDescription = VALUES(audienceDescription),
           followerCount = VALUES(followerCount), followingCount = VALUES(followingCount),
           postCount = VALUES(postCount)`,
        [part]
      );
    }
    for (const part of chunks(provenanceRows, 250)) {
      await connection.query(
        `INSERT INTO demo_dataset_records
          (namespace, recordKey, entityType, entityId, provenance) VALUES ?
         ON DUPLICATE KEY UPDATE entityId = VALUES(entityId), provenance = VALUES(provenance)`,
        [part]
      );
    }

    await connection.commit();
    const createdAccounts = missing.length;
    console.log(JSON.stringify({
      namespace: NAMESPACE,
      sourceRecords: records.length,
      createdAccounts,
      reusedAccounts: records.length - createdAccounts,
      creatorProfiles: records.length,
      loginEnabled: true,
      contactDetailsStored: false,
    }));
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(`Dataset sample seeding failed: ${error.code || error.message || 'database error'}`);
    process.exitCode = 1;
  } finally {
    connection?.release();
    await db.end();
  }
}

if (require.main === module) run();

module.exports = { NAMESPACE, countValue, parseCsv, parseDatasetRows, run };
