'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { requireRole } = require('../middleware/roleMiddleware');
const { createRouter } = require('../routes/mlRecommendationRoutes');
const campaignController = require('../controllers/campaignController');
const database = require('../config/db');

const campaign = {
  campaignId: 42,
  nicheText: 'A beauty business selling skincare and personal care products.',
  businessName: 'Glow Beauty Kenya',
  industry: 'Beauty',
  publicationStatus: 'open',
};

async function fixture(t, { rows = [campaign], recommend } = {}) {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [rows];
    },
  };
  const app = express();
  app.use('/api/campaigns', createRouter({
    express,
    db,
    verifyToken: (req, res, next) => {
      req.user = { userId: 9, role: 'business' };
      next();
    },
    requireRole,
    ...(recommend ? { recommend } : {}),
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  return {
    calls,
    request: async path => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/campaigns${path}`, {
        method: 'POST',
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

test('ML route maps existing campaign/business data without app creator IDs', async t => {
  let received;
  const f = await fixture(t, {
    recommend: async (business, topN) => {
      received = { business, topN };
      return [{
        creator_username: 'catalog_creator',
        creator_category: 'Beauty',
        creator_bio: 'Beauty and skincare creator profile person@example.test',
        score: 0.7,
        rank: 1,
        feature_values: { text_similarity: 0.4, semantic_similarity: 0.7, baseline_er_missing: 1 },
        model_contributions: [
          { feature: 'text_similarity', standardized_value: 0.4, contribution: 0.2 },
          { feature: 'semantic_similarity', standardized_value: 0.7, contribution: 0.3 },
          { feature: 'log_creator_followers', standardized_value: 0.1, contribution: 0.01 },
          { feature: 'log_creator_following', standardized_value: 0.2, contribution: 0.02 },
          { feature: 'log_creator_post_count', standardized_value: 0.6, contribution: 0.12 },
          { feature: 'baseline_er_missing', standardized_value: 1, contribution: -0.5 },
        ],
        model_intercept: -0.1,
      }];
    },
  });

  const response = await f.request('/42/ml-recommendations?top_n=1');
  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    business: {
      name: 'Glow Beauty Kenya',
      category: 'Beauty',
      description: campaign.nicheText,
    },
    topN: 1,
  });
  assert.equal(response.body.recommendations[0].creator_username, 'catalog_creator');
  assert.doesNotMatch(response.body.recommendations[0].creator_bio, /person@example\.test/i);
  assert.match(response.body.recommendations[0].creator_bio, /\[contact removed\]/);
  assert.equal('profileId' in response.body.recommendations[0], false);
  assert.match(response.body.creatorIdentity, /not linked to a Bizi creator account/);
  assert.match(response.body.scoreMeaning, /not a probability.*ROI/);
  assert.match(response.body.recommendations[0].explanation.why_recommended, /positive model contributions from .*text similarity/);
  assert.match(response.body.recommendations[0].explanation.unknowns[0], /unavailable across the current serving catalog/);
  assert.match(response.body.recommendations[0].explanation.unknowns[0], /does not distinguish their ranking/);
  assert.ok(response.body.recommendations[0].explanation.citations.some(source => source.id === 'creator-catalog:catalog_creator'));
  assert.ok(response.body.recommendations[0].explanation.citations.some(source => source.id === 'model:catalog_creator'));
});

test('ML route returns 404 for a campaign not owned by the business', async t => {
  let called = false;
  const f = await fixture(t, { rows: [], recommend: async () => { called = true; return []; } });
  const response = await f.request('/42/ml-recommendations');
  assert.equal(response.status, 404);
  assert.equal(called, false);
});

test('ML route proxies a real ranked result from the running Python service', async t => {
  const health = await fetch(`${process.env.BIZI_ML_SERVICE_URL || 'http://127.0.0.1:8001'}/health`);
  assert.equal(health.status, 200, 'Python ML service must be running for this integration test');

  const f = await fixture(t);
  const response = await f.request('/42/ml-recommendations?top_n=10');
  assert.equal(response.status, 200);
  assert.equal(response.body.recommendations.length, 10);
  assert.equal(response.body.catalog, 'bizi_model_export');
  for (const [index, recommendation] of response.body.recommendations.entries()) {
    assert.equal(recommendation.rank, index + 1);
    assert.equal(typeof recommendation.creator_username, 'string');
    assert.equal(Number.isFinite(recommendation.score), true);
    assert.equal('profileId' in recommendation, false);
    assert.equal(recommendation.model_contributions.length, 6);
    assert.equal(recommendation.explanation.model_contributions.length, 5);
    assert.equal(recommendation.feature_values.baseline_er_missing, 1);
    assert.equal(recommendation.explanation.unknowns.some(item => item.includes('constant for all candidates')), true);
    const linearDecision = recommendation.model_intercept
      + recommendation.model_contributions.reduce((sum, item) => sum + item.contribution, 0);
    const scoreLogit = Math.log(recommendation.score / (1 - recommendation.score));
    assert.ok(Math.abs(linearDecision - scoreLogit) < 1e-6);
    if (index > 0) {
      assert.ok(response.body.recommendations[index - 1].score >= recommendation.score);
    }
  }
});

test('campaign owner can publish; another business or creator cannot change publication state', async () => {
  const calls = [];
  const originalQuery = database.query;
  let owned = true;
  database.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT c.campaignId FROM campaigns')) return [owned ? [{ campaignId: 42 }] : []];
    return [{ affectedRows: 1 }];
  };
  const { setCampaignPublication } = campaignController;
  const response = { statusCode: 200, body: null, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  try {
    await setCampaignPublication({ user: { userId: 9, role: 'business' }, params: { campaignId: '42' }, body: { publicationStatus: 'open' } }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls[0].params, [42, 9]);
    assert.deepEqual(calls[1].params, ['open', 42]);

    owned = false;
    const unowned = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json() { return this; } };
    const before = calls.length;
    await setCampaignPublication({ user: { userId: 99, role: 'business' }, params: { campaignId: '42' }, body: { publicationStatus: 'closed' } }, unowned);
    assert.equal(unowned.statusCode, 404);
    assert.equal(calls.length, before + 1);
    const forbidden = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json() { return this; } };
    await setCampaignPublication({ user: { userId: 9, role: 'creator' }, params: { campaignId: '42' }, body: { publicationStatus: 'closed' } }, forbidden);
    assert.equal(forbidden.statusCode, 403);
    const invalid = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json() { return this; } };
    await setCampaignPublication({ user: { userId: 9, role: 'business' }, params: { campaignId: '42' }, body: { publicationStatus: 'invalid' } }, invalid);
    assert.equal(invalid.statusCode, 400);
  } finally {
    database.query = originalQuery;
  }
});

test('ML route requires the owned campaign to be open', async t => {
  let called = false;
  const f = await fixture(t, { rows: [{ ...campaign, publicationStatus: 'draft' }], recommend: async () => { called = true; return []; } });
  const response = await f.request('/42/ml-recommendations');
  assert.equal(response.status, 409);
  assert.match(response.body.error, /Open the campaign/);
  assert.equal(called, false);
});