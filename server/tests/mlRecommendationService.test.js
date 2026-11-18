'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recommendCreators, MlServiceError } = require('../services/mlRecommendationService');

const business = { name: 'Glow', category: 'Beauty', description: 'Skincare promotion' };

test('recommendation service forwards stored creator profile features and a private Space token', async t => {
  const creators = [{
    creator_id: 73,
    creator_username: 'dataset_creator',
    creator_display_name: 'Dataset Creator',
    creator_followers: 1200,
    creator_following: 300,
    creator_post_count: 84,
    creator_website: null,
    creator_category: 'Beauty',
    creator_bio: 'Beauty creator',
    is_sample_account: true,
  }];
  const previousToken = process.env.BIZI_ML_SERVICE_TOKEN;
  process.env.BIZI_ML_SERVICE_TOKEN = 'test-private-space-token';
  t.after(() => {
    if (previousToken === undefined) delete process.env.BIZI_ML_SERVICE_TOKEN;
    else process.env.BIZI_ML_SERVICE_TOKEN = previousToken;
  });

  const requests = [];
  const result = await recommendCreators(
    business,
    1,
    async (url, options) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : undefined });
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ embedding_cache_warming: false }), { status: 200 });
      }
      return new Response(JSON.stringify({
        recommendations: [{
          creator_username: 'dataset_creator',
          creator_id: 73,
          is_sample_account: true,
          rank: 1,
          score: 0.7,
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    { creators }
  );

  assert.deepEqual(requests[1].body, { business, creators });
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-private-space-token');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer test-private-space-token');
  assert.equal(result[0].creator_id, 73);
  assert.equal(result[0].is_sample_account, true);
});

test('recommendation service rejects sample results without a creator ID', () => {
  assert.throws(
    () => require('../services/mlRecommendationService').validateRecommendationResponse({
      recommendations: [{
        creator_username: 'dataset_creator',
        is_sample_account: true,
        rank: 1,
        score: 0.7,
      }],
    }, 1),
    MlServiceError
  );
});

test('recommendation service reports when the embedding cache is warming', async () => {
  await assert.rejects(
    recommendCreators(business, 1, async () => new Response(JSON.stringify({
      embedding_cache_warming: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    error => error instanceof MlServiceError
      && error.message === 'Recommendation service is warming up, try again shortly'
  );
});
