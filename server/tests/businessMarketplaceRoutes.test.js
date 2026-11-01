'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRouter } = require('../routes/businessMarketplaceRoutes');

async function fixture(t, options = {}) {
  const calls = [];
  const state = {
    role: options.role || 'business',
    businessId: options.businessId || 12,
    campaignOwned: options.campaignOwned !== false,
    publicationStatus: options.publicationStatus || 'open',
    applicationStatus: options.applicationStatus || 'pending',
    duplicateInvitation: !!options.duplicateInvitation,
    creatorExists: options.creatorExists !== false,
    acceptedInvitation: !!options.acceptedInvitation,
    acceptedApplication: !!options.acceptedApplication,
    totalBudget: options.totalBudget ?? 100000,
    targetCreatorCount: options.targetCreatorCount ?? 5,
    allocatedBudget: options.allocatedBudget ?? 0,
    filledCreatorSlots: options.filledCreatorSlots ?? 0,
    lastInvitation: null,
    declinedInvitation: false,
  };
  async function query(sql, params = []) {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT role')) return [[{ role: state.role }]];
    if (sql.startsWith('SELECT businessId')) return [[{ businessId: state.businessId }]];
    if (sql.includes('FROM creators c JOIN users u') && sql.includes('WHERE c.creatorId')) return [state.creatorExists ? [{ creatorId: params[0] }] : []];
    if (sql.startsWith('SELECT campaignId, publicationStatus')) return [state.campaignOwned ? [{ campaignId: params[0], publicationStatus: state.publicationStatus, totalBudget: state.totalBudget, currency: 'KES', targetCreatorCount: state.targetCreatorCount, allocatedBudget: state.allocatedBudget, filledCreatorSlots: state.filledCreatorSlots }] : []];
    if (sql.startsWith('SELECT campaignId, totalBudget')) return [state.campaignOwned && state.publicationStatus === 'open' ? [{ campaignId: params[0], totalBudget: state.totalBudget, currency: 'KES', targetCreatorCount: state.targetCreatorCount }] : []];
    if (sql.startsWith('SELECT campaignId, targetCreatorCount')) return [state.campaignOwned ? [{ campaignId: params[0], targetCreatorCount: state.targetCreatorCount }] : []];
    if (sql.startsWith('SELECT campaignId FROM campaigns')) return [state.campaignOwned && state.publicationStatus === 'open' ? [{ campaignId: params[0] }] : []];
    if (sql.startsWith('SELECT COALESCE(SUM(offeredAmount)')) return [[{ allocatedBudget: state.allocatedBudget }]];
    if (sql.includes('AS filledCreatorSlots')) return [[{ filledCreatorSlots: state.filledCreatorSlots }]];
    if (sql.startsWith('SELECT applicationId, creatorId, status')) return [[{ applicationId: params[0], creatorId: 31, status: state.applicationStatus }]];
    if (sql.startsWith('SELECT invitationId FROM campaign_invitations WHERE campaignId') && sql.includes("status = 'accepted'")) return [state.acceptedInvitation ? [{ invitationId: 7 }] : []];
    if (sql.startsWith('SELECT invitationId FROM campaign_invitations WHERE campaignId')) return [state.duplicateInvitation ? [{ invitationId: 7 }] : []];
    if (sql.startsWith('SELECT applicationId FROM campaign_applications')) return [state.acceptedApplication ? [{ applicationId: 4 }] : []];
    if (sql.startsWith('SELECT invitationId FROM campaign_invitations')) return [state.acceptedInvitation ? [{ invitationId: 7 }] : []];
    if (sql.startsWith('UPDATE campaign_applications')) {
      if (state.applicationStatus !== 'pending') return [{ affectedRows: 0 }];
      state.applicationStatus = params[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE campaign_invitations')) {
      if (sql.includes("SET status = 'declined'")) state.declinedInvitation = true;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO campaign_invitations')) { state.lastInvitation = { sql, params }; state.allocatedBudget += Number(params[4]); return [{ insertId: 99 }]; }
    if (sql.startsWith('SELECT a.applicationId')) return [[{
      applicationId: 4, campaignId: 3, status: 'pending', applicationMessage: 'A brief note',
      creatorId: 31, displayName: 'Creator Example', username: '@creator', niche: 'Food',
      bio: 'Recipe maker', audienceDescription: 'Home cooks', platforms: 'Instagram',
      location: 'Nairobi', portfolioUrl: null, followerCount: 1234, selfReportedEngagement: 2.4,
    }]];
    if (sql.startsWith('SELECT i.invitationId')) return [[{
      invitationId: 8, campaignId: 3, creatorId: 31, status: 'pending', displayName: 'Creator Example', username: '@creator',
    }]];
    if (sql.startsWith('SELECT c.creatorId')) return [[{
      creatorId: 31, displayName: 'Creator Example', username: '@creator', niche: 'Food',
      bio: 'Recipe maker', audienceDescription: 'Home cooks', platforms: 'Instagram', location: 'Nairobi',
    }]];
    return [[]];
  }
  const db = {
    query,
    getConnection: async () => ({
      beginTransaction: async () => calls.push({ transaction: 'begin' }),
      commit: async () => calls.push({ transaction: 'commit' }),
      rollback: async () => calls.push({ transaction: 'rollback' }),
      release: () => {},
      query,
    }),
  };
  const app = express();
  app.use(express.json());
  app.use('/api/business', createRouter({
    express, db,
    verifyToken: (req, res, next) => { req.user = { userId: 5, role: options.tokenRole || 'business' }; next(); },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (path, body, method) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/business${path}`, {
      method: method || (body ? 'POST' : 'GET'),
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  return { request, calls, state };
}

test('business can view application creator summary only for its owned campaign', async t => {
  const f = await fixture(t);
  const result = await f.request('/campaigns/3/applications');
  assert.equal(result.status, 200);
  assert.equal(result.body[0].displayName, 'Creator Example');
  assert.equal(result.body[0].applicationMessage, 'A brief note');
  assert.equal(result.body[0].selfReportedEngagement, 2.4);
  assert.ok(f.calls.some(call => call.params.includes(12)));
});

test('business cannot view applications for another business campaign', async t => {
  const f = await fixture(t, { campaignOwned: false });
  assert.equal((await f.request('/campaigns/3/applications')).status, 404);
  assert.equal(f.calls.some(call => call.sql.startsWith('SELECT a.applicationId')), false);
});

test('business accepts and rejects only pending applications', async t => {
  const accept = await fixture(t);
  const accepted = await accept.request('/campaigns/3/applications/4', { status: 'accepted' }, 'PATCH');
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.status, 'accepted');
  assert.ok(accept.calls.some(call => call.sql?.includes("SET status = 'declined'") && call.sql.includes('campaign_invitations')));

  const reject = await fixture(t);
  const rejected = await reject.request('/campaigns/3/applications/4', { status: 'rejected' }, 'PATCH');
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.status, 'rejected');
  const decided = await fixture(t, { applicationStatus: 'accepted' });
  assert.equal((await decided.request('/campaigns/3/applications/4', { status: 'rejected' }, 'PATCH')).status, 409);
});

test('business cannot send arbitrary application status or accept against an accepted invitation', async t => {
  const invalid = await fixture(t);
  assert.equal((await invalid.request('/campaigns/3/applications/4', { status: 'pending' }, 'PATCH')).status, 400);
  const conflict = await fixture(t, { acceptedInvitation: true });
  assert.equal((await conflict.request('/campaigns/3/applications/4', { status: 'accepted' }, 'PATCH')).status, 409);
});

test('business can invite a registered creator to its open campaign', async t => {
  const f = await fixture(t);
  const result = await f.request('/campaigns/3/invitations', { creatorId: 31, message: 'Please consider this campaign.' });
  assert.equal(result.status, 201);
  assert.equal(result.body.creatorId, 31);
  assert.equal(result.body.offeredAmount, 20000);
  assert.equal(result.body.suggestedOffer, 20000);
  assert.ok(f.calls.some(call => call.sql?.startsWith('INSERT INTO campaign_invitations') && call.params[1] === 31));
  assert.equal(f.state.lastInvitation.params[4], 20000);

  const adjusted = await fixture(t);
  const manual = await adjusted.request('/campaigns/3/invitations', { creatorId: 31, offeredAmount: 25000 });
  assert.equal(manual.status, 201);
  assert.equal(manual.body.offeredAmount, 25000);
  assert.equal(adjusted.state.lastInvitation.params[4], 25000);
});

test('business invitation rejects closed/unowned campaigns, invalid creators, and duplicate pending invitations', async t => {
  assert.equal((await (await fixture(t, { publicationStatus: 'closed' })).request('/campaigns/3/invitations', { creatorId: 31 })).status, 404);
  assert.equal((await (await fixture(t, { campaignOwned: false })).request('/campaigns/3/invitations', { creatorId: 31 })).status, 404);
  assert.equal((await (await fixture(t, { creatorExists: false })).request('/campaigns/3/invitations', { creatorId: 31 })).status, 404);
  const duplicate = await fixture(t, { duplicateInvitation: true });
  assert.equal((await duplicate.request('/campaigns/3/invitations', { creatorId: 31 })).status, 409);
});

test('business cannot allocate offers beyond remaining campaign budget or fill past target slots', async t => {
  const overBudget = await fixture(t, { allocatedBudget: 85000 });
  assert.equal((await overBudget.request('/campaigns/3/invitations', { creatorId: 31, offeredAmount: 20000 })).status, 409);
  assert.equal(overBudget.state.lastInvitation, null);

  const overSlots = await fixture(t, { filledCreatorSlots: 5 });
  assert.equal((await overSlots.request('/campaigns/3/invitations', { creatorId: 31 })).status, 409);
  assert.equal(overSlots.state.lastInvitation, null);

  const otherBusiness = await fixture(t, { campaignOwned: false });
  assert.equal((await otherBusiness.request('/campaigns/3/invitations')).status, 404);
});

test('pending invitation does not count as a filled creator slot', async t => {
  const f = await fixture(t, { allocatedBudget: 20000, filledCreatorSlots: 0 });
  const result = await f.request('/campaigns/3/invitations', { creatorId: 32 });
  assert.equal(result.status, 201);
  assert.equal(f.state.filledCreatorSlots, 0);
});

test('budget validation counts accepted and active pending offers, not declined offers', async t => {
  const f = await fixture(t, { allocatedBudget: 80000 });
  const result = await f.request('/campaigns/3/invitations', { creatorId: 31, offeredAmount: 20000 });
  assert.equal(result.status, 201);
  assert.equal(f.state.lastInvitation.params[4], 20000);
  assert.match(f.calls.find(call => call.sql?.startsWith('SELECT COALESCE(SUM(offeredAmount)')).sql, /status = 'accepted'.*status = 'pending'/);
});

test('business route checks the live business role and lists campaign invitations', async t => {
  const denied = await fixture(t, { role: 'creator' });
  assert.equal((await denied.request('/campaigns/3/applications')).status, 403);
  const listed = await fixture(t);
  assert.equal((await listed.request('/campaigns/3/invitations')).body[0].username, '@creator');
});

test('business cannot accept an application when a creator invitation is already accepted', async t => {
  const f = await fixture(t, { acceptedInvitation: true });
  const result = await f.request('/campaigns/3/applications/4', { status: 'accepted' }, 'PATCH');
  assert.equal(result.status, 409);
  assert.equal(f.calls.some(call => call.sql?.startsWith('UPDATE campaign_applications')), false);
});
