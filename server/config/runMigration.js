const fs = require('fs');
const path = require('path');
const pool = require('./db');

const schemaPath = path.join(__dirname, 'schema.sql');

function extractTableName(statement) {
  const match = statement.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i);
  return match ? match[1] : 'unknown_table';
}

async function runMigration() {
  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');

    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      const tableName = extractTableName(statement);
      await pool.query(statement);
      console.log(`Created table: ${tableName}`);
    }

    console.log('Migration completed successfully.');
    await pool.end();
  } catch (error) {
    console.error('Migration failed:', error.message);
    try {
      await pool.end();
    } catch (closeError) {
      console.error('Failed to close DB pool:', closeError.message);
    }
    process.exit(1);
  }
}

runMigration();
