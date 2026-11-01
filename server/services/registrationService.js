'use strict';
// Both records must commit together; a failed profile insert must not reserve an email.
function createRegistrationService({ db, hashPassword }) {
  return async function register(role, fields) {
    if (!['business', 'creator'].includes(role)) throw new Error('Unsupported account role');
    const passwordHash = await hashPassword(fields.password);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [user] = await connection.query('INSERT INTO users (name,email,passwordHash,role) VALUES (?,?,?,?)',
        [fields.name.trim(), fields.email.trim().toLowerCase(), passwordHash, role]);
      const [account] = role === 'business'
        ? await connection.query('INSERT INTO businesses (userId,businessName,industry) VALUES (?,?,?)', [user.insertId, fields.businessName.trim(), fields.industry?.trim() || null])
        : await connection.query('INSERT INTO creators (userId,publicHandle) VALUES (?,?)', [user.insertId, fields.publicHandle.trim()]);
      await connection.commit();
      return { userId: user.insertId, [role === 'business' ? 'businessId' : 'creatorId']: account.insertId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  };
}
module.exports = { createRegistrationService };
