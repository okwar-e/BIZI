'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const express = require('express');

const db = require('../config/db');
const originalQuery = db.query;
const originalGetConnection = db.getConnection;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = 'local-auth-registration-test-secret';
process.env.JWT_SECRET = testSecret;
const authRoutes = require('../routes/authRoutes');

test('Business and Creator signup persist separate roles and login returns each saved role', async t => {
  const users = new Map();
  const businessProfiles = [];
  const creatorProfiles = [];
  let nextUserId = 1;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO users')) {
        const [name, email, passwordHash, role] = params;
        const userId = nextUserId++;
        users.set(email, { userId, name, email, passwordHash, role });
        return [{ insertId: userId }];
      }
      if (sql.includes('INSERT INTO businesses')) {
        const [userId, businessName, industry] = params;
        businessProfiles.push({ userId, businessName, industry });
        return [{ insertId: businessProfiles.length }];
      }
      if (sql.includes('INSERT INTO creators')) {
        const [userId, publicHandle] = params;
        creatorProfiles.push({ userId, publicHandle });
        return [{ insertId: creatorProfiles.length }];
      }
      throw new Error('Unexpected registration query');
    },
  };
  db.getConnection = async () => connection;
  db.query = async (sql, params) => {
    assert.match(sql, /SELECT \* FROM users WHERE email = \? LIMIT 1/);
    return [[users.get(params[0])].filter(Boolean)];
  };

  t.after(() => {
    db.query = originalQuery;
    db.getConnection = originalGetConnection;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
  const registrations = [
    {
      role: 'business',
      email: 'business@example.test',
      body: { name: 'Business User', email: 'business@example.test', password: 'BusinessPass123!', businessName: 'Test Business' },
    },
    {
      role: 'creator',
      email: 'creator@example.test',
      body: { name: 'Creator User', email: 'creator@example.test', password: 'CreatorPass123!', publicHandle: '@testcreator' },
    },
  ];

  for (const { role, email, body } of registrations) {
    const registration = await fetch(`${baseUrl}/register/${role}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(registration.status, 201);

    const savedUser = users.get(email);
    assert.equal(savedUser.role, role);
    assert.equal(await bcrypt.compare(body.password, savedUser.passwordHash), true);

    if (role === 'business') {
      assert.deepEqual(businessProfiles, [{ userId: savedUser.userId, businessName: 'Test Business', industry: null }]);
      assert.deepEqual(creatorProfiles, []);
    } else {
      assert.deepEqual(creatorProfiles, [{ userId: savedUser.userId, publicHandle: '@testcreator' }]);
      assert.equal(businessProfiles.length, 1);
    }

    const login = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: body.password }),
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    assert.equal(session.role, role);
    assert.equal(jwt.verify(session.token, testSecret).role, role);
  }
});
