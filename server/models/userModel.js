const db = require('../config/db');

async function createUser({ name, email, passwordHash, role }) {
  const [result] = await db.query(
    `INSERT INTO users (name, email, passwordHash, role) VALUES (?, ?, ?, ?)`,
    [name, email, passwordHash, role]
  );

  return result.insertId;
}

async function findUserByEmail(email) {
  const [rows] = await db.query(`SELECT * FROM users WHERE email = ? LIMIT 1`, [email]);
  return rows[0] || null;
}

async function findUserById(userId) {
  const [rows] = await db.query(`SELECT * FROM users WHERE userId = ? LIMIT 1`, [userId]);
  return rows[0] || null;
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
};
