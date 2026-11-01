'use strict';
const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/db');
(async () => {
  try {
    for (const sql of fs.readFileSync(path.join(__dirname, '../config/recommendationV1.sql'), 'utf8').split(';').map(s=>s.trim()).filter(Boolean)) await db.query(sql);
    console.log('Recommendation v1 additive migration complete.');
  } catch (e) {
    console.error('Migration failed:', e.code || e.message || 'Unknown database error');
    if (e.code === 'ECONNREFUSED') console.error('Start the configured MySQL service and rerun this additive migration.');
    process.exitCode = 1;
  }
  finally { await db.end(); }
})();
