'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const testSecret = 'local-auth-session-test-secret';
process.env.JWT_SECRET = testSecret;
const authRoutes = require('../routes/authRoutes');

test('session endpoint restores identity from a valid token and rejects an expired token', async t => {
  const app = express();
  app.use('/api/auth', authRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const url = `http://127.0.0.1:${server.address().port}/api/auth/session`;
  const validToken = jwt.sign({ userId: 42, role: 'creator' }, testSecret, { expiresIn: '1h' });
  const validResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(validResponse.status, 200);
  assert.deepEqual(await validResponse.json(), { userId: 42, role: 'creator' });

  const expiredToken = jwt.sign({
    userId: 42,
    role: 'creator',
    exp: Math.floor(Date.now() / 1000) - 1,
  }, testSecret);
  const expiredResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(expiredResponse.status, 401);
  assert.deepEqual(await expiredResponse.json(), { message: 'Unauthorized' });
});
