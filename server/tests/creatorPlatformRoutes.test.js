'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRouter, validateProfile, profileCompletion } = require('../routes/creatorPlatformRoutes');

async function fixture(t, { role = 'creator', query, invitationStatus = 'pending', invitationUpdateRows = 1, acceptedApplication = false, invitationExpiresAt = null, filledCreatorSlots = 0, targetCreatorCount = 5, ownsInvitation = true } = {}) {
  const calls = [];
  const db = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (query) return query(sql, params);
      if (sql.startsWith('SELECT role')) return [[{ role }]];
      if (sql.startsWith('SELECT creatorId')) return [[{ creatorId: 17 }]];
      if (sql.includes('AS displayName')) return [[{
        displayName: 'Creator One', username: '@creator-one', niche: 'Food', bio: 'Recipe creator',
        platforms: 'Instagram', location: 'Nairobi', portfolioUrl: null, availability: 'available',
        preferences: '{}', followerCount: null, selfReportedEngagement: null,
      }]];
      if (sql.startsWith('SELECT status, expiresAt')) return [[{ status: invitationStatus, expiresAt: invitationExpiresAt }]];
      if (sql.startsWith('UPDATE campaign_invitations')) return [{ affectedRows: invitationUpdateRows }];
      if (sql.startsWith('UPDATE campaign_applications')) return [{ affectedRows: invitationUpdateRows }];
      if (sql.startsWith('SELECT status FROM campaign_applications')) return [[{ status: invitationStatus }]];
      return [[]];
    },
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      query: async (sql, params = []) => {
        if (query) return query(sql, params);
        calls.push({ sql, params });
        if (sql.startsWith('SELECT campaignId FROM campaign_invitations')) return [ownsInvitation ? [{ campaignId: 42 }] : []];
        if (sql.startsWith('SELECT campaignId, offeredAmount FROM campaign_invitations')) return [ownsInvitation ? [{ campaignId: 42, offeredAmount: 20000 }] : []];
        if (sql.startsWith('SELECT campaignId, targetCreatorCount FROM campaigns')) return [[{ campaignId: 42, targetCreatorCount }]];
        if (sql.startsWith('SELECT targetCreatorCount FROM campaigns')) return [[{ targetCreatorCount }]];
        if (sql.includes('AS filledCreatorSlots')) return [[{ filledCreatorSlots }]];
        if (sql.startsWith('SELECT campaignId FROM campaigns')) return [[{ campaignId: 42 }]];
        if (sql.startsWith('SELECT profileId')) return [[{ profileId: 9 }]];
        if (sql.startsWith('INSERT INTO campaign_applications')) return [{ insertId: 91 }];
        if (sql.startsWith('SELECT applicationId FROM campaign_applications')) return [acceptedApplication ? [{ applicationId: 2 }] : []];
        if (sql.startsWith('UPDATE campaign_invitations')) return [{ affectedRows: invitationUpdateRows }];
        if (sql.startsWith('SELECT status, expiresAt')) return [[{ status: invitationStatus, expiresAt: invitationExpiresAt }]];
        return [[]];
      },
    }),
  };
  const app = express();
  app.use(express.json());
  app.use('/api/creator', createRouter({
    express, db,
    verifyToken: (req, res, next) => { req.user = { userId: 8, role: 'creator' }; next(); },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (path, body, method) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/creator${path}`, {
      method: method || (body ? 'POST' : 'GET'),
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  return { request, calls, db };
}

test('creator API rejects accounts whose live database role is not creator', async t => {
  const f = await fixture(t, { role: 'business' });
  assert.equal((await f.request('/profile')).status, 403);
  assert.equal(f.calls.length, 1);
});

test('creator profile returns only the authenticated creator profile fields', async t => {
  const f = await fixture(t);
  const response = await f.request('/profile');
  assert.equal(response.status, 200);
  assert.equal(response.body.username, '@creator-one');
  assert.equal(response.body.profileCompletion, 75);
  assert.equal(f.calls[2].params[0], 17);
  assert.ok(!JSON.stringify(response.body).includes('passwordHash'));
});

test('campaign discovery filters to open records and uses creator-safe fields', async t => {
  const f = await fixture(t);
  const response = await f.request('/campaigns');
  assert.equal(response.status, 200);
  assert.match(f.calls[2].sql, /publicationStatus = 'open'/);
  assert.ok(!f.calls[2].sql.includes('nicheEmbedding'));
  assert.match(f.calls[2].sql, /b\.userId <> \?/);
});

test('application creation is scoped to the logged-in creator and validates messages', async t => {
  let inserted;
  const f = await fixture(t, { query: async (sql, params) => {
    if (sql.startsWith('SELECT role')) return [[{ role: 'creator' }]];
    if (sql.startsWith('SELECT creatorId')) return [[{ creatorId: 17 }]];
    if (sql.startsWith('SELECT c.campaignId FROM campaigns')) return [[{ campaignId: 42 }]];
    if (sql.startsWith('SELECT profileId')) return [[{ profileId: 9 }]];
    if (sql.startsWith('INSERT INTO campaign_applications')) { inserted = params; return [{ insertId: 91 }]; }
    return [[]];
  } });
  const response = await f.request('/campaigns/42/apply', { message: 'Interested in this opportunity.' });
  assert.equal(response.status, 201);
  assert.deepEqual(inserted, [42, 17, 'Interested in this opportunity.']);
  assert.equal((await f.request('/campaigns/42/apply', { message: 'x'.repeat(2001) })).status, 400);
});

test('duplicate application returns a conflict and application history is scoped to creatorId', async t => {
  const duplicate = await fixture(t);
  duplicate.db.getConnection = async () => ({
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async sql => {
      if (sql.startsWith('SELECT c.campaignId FROM campaigns')) return [[{ campaignId: 42 }]];
      if (sql.startsWith('SELECT profileId')) return [[{ profileId: 1 }]];
      if (sql.startsWith('SELECT invitationId')) return [[]];
      if (sql.startsWith('INSERT INTO campaign_applications')) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      return [[]];
    },
  });
  assert.equal((await duplicate.request('/campaigns/42/apply', {})).status, 409);
  const list = await duplicate.request('/applications');
  assert.equal(list.status, 200);
  const query = duplicate.calls.find(call => call.sql.startsWith('SELECT a.applicationId'));
  assert.deepEqual(query.params, [17]);
});

test('creator can withdraw only their own pending application', async t => {
  const f = await fixture(t);
  const response = await f.request('/applications/91/withdraw', {});
  assert.equal(response.status, 200);
  const update = f.calls.find(call => call.sql.startsWith('UPDATE campaign_applications'));
  assert.deepEqual(update.params, [91, 17]);
  assert.match(update.sql, /status = 'pending'/);

  const repeated = await fixture(t, { invitationUpdateRows: 0, invitationStatus: 'accepted' });
  assert.equal((await repeated.request('/applications/91/withdraw', {})).status, 409);
});

test('invitation response only updates a pending invitation owned by the creator', async t => {
  const f = await fixture(t);
  const response = await f.request('/invitations/55/accept', {});
  assert.equal(response.status, 200);
  const update = f.calls.find(call => call.sql.startsWith('UPDATE campaign_invitations'));
  assert.deepEqual(update.params, ['accepted', 55, 17]);
  assert.match(update.sql, /status = 'pending'/);
});

test('creator can decline a pending invitation and cannot act on non-pending invitations', async t => {
  const decline = await fixture(t);
  const response = await decline.request('/invitations/55/decline', {});
  assert.equal(response.status, 200);
  assert.deepEqual(decline.calls.find(call => call.sql.startsWith('UPDATE campaign_invitations')).params, ['declined', 55, 17]);

  const repeated = await fixture(t, { invitationStatus: 'accepted', invitationUpdateRows: 0 });
  assert.equal((await repeated.request('/invitations/55/decline', {})).status, 409);
  assert.ok(decline.calls.some(call => call.sql.startsWith('UPDATE campaign_invitations') && call.params[0] === 'declined'));
});

test('creator only sees and responds to own offer; accepted amount is returned', async t => {
  const f = await fixture(t);
  const response = await f.request('/invitations/55/accept', {});
  assert.equal(response.status, 200);
  assert.equal(response.body.offeredAmount, 20000);
  assert.ok(f.calls.some(call => call.sql.includes('WHERE invitationId = ? AND creatorId = ?') && call.params.includes(17)));

  const otherCreator = await fixture(t, { ownsInvitation: false });
  assert.equal((await otherCreator.request('/invitations/55/accept', {})).status, 404);
});

test('creator invitation history includes the offer and filters by their creator ID', async t => {
  const f = await fixture(t, { query: async (sql, params) => {
    if (sql.startsWith('SELECT role')) return [[{ role: 'creator' }]];
    if (sql.startsWith('SELECT creatorId')) return [[{ creatorId: 17 }]];
    if (sql.startsWith('SELECT i.invitationId')) return [[{ invitationId: 55, creatorId: 17, offeredAmount: 20000, currency: 'KES', nicheText: 'Food' }]];
    return [[]];
  } });
  const result = await f.request('/invitations');
  assert.equal(result.status, 200);
  assert.equal(result.body[0].offeredAmount, 20000);
  const listQuery = f.calls.find(call => call.sql.startsWith('SELECT i.invitationId'));
  assert.deepEqual(listQuery.params, [17]);
  assert.match(listQuery.sql, /i\.offeredAmount/);
});

test('accepted invitation fills one creator slot and pending invitations do not', async t => {
  const accepted = await fixture(t, { filledCreatorSlots: 0, targetCreatorCount: 1 });
  assert.equal((await accepted.request('/invitations/55/accept', {})).status, 200);
  assert.ok(accepted.calls.some(call => call.sql.includes('AS filledCreatorSlots')));

  const full = await fixture(t, { filledCreatorSlots: 1, targetCreatorCount: 1 });
  const result = await full.request('/invitations/55/accept', {});
  assert.equal(result.status, 409);
  assert.match(result.body.error, /slots/);
  assert.equal(full.calls.some(call => call.sql.startsWith('UPDATE campaign_invitations')), false);

  const pending = await fixture(t, { filledCreatorSlots: 0, targetCreatorCount: 1 });
  assert.equal((await pending.request('/invitations/55/decline', {})).status, 200);
  assert.ok(pending.calls.some(call => call.sql.includes('AS filledCreatorSlots')) === false);
});

test('creator cannot accept an invitation when an application is already accepted for that campaign', async t => {
  const f = await fixture(t, { acceptedApplication: true });
  const response = await f.request('/invitations/55/accept', {});
  assert.equal(response.status, 409);
  assert.equal(f.calls.some(call => call.sql.startsWith('UPDATE campaign_invitations')), false);
});

test('expired pending invitation is marked expired and cannot be accepted', async t => {
  const f = await fixture(t, { invitationUpdateRows: 0, invitationExpiresAt: new Date(Date.now() - 60000) });
  const response = await f.request('/invitations/55/accept', {});
  assert.equal(response.status, 409);
  assert.match(response.body.error, /expired/i);
  assert.ok(f.calls.some(call => call.sql.includes("SET status = 'expired'")));
});

test('profile validation rejects arbitrary fields and invalid portfolio URLs', () => {
  assert.equal(validateProfile({ displayName: 'A', username: 'a', bio: 'bio', niche: 'food' }, 'PUT'), null);
  assert.equal(validateProfile({ admin: true }, 'PATCH'), 'Unsupported profile field');
  assert.equal(validateProfile({ portfolioUrl: 'javascript:alert(1)' }, 'PATCH'), 'portfolioUrl must use HTTP or HTTPS');
  assert.equal(profileCompletion({ displayName: 'A', username: 'a', bio: 'bio', niche: 'food' }), 50);
});
