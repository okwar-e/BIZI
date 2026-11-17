'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recommendCreators, MlServiceError } = require('../services/mlRecommendationService');

const business = { name: 'Glow', category: 'Beauty', description: 'Skincare promotion' };

test('recommendation service forwards stored creator profile features to FastAPI', async () => {
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
  let request;
  const result = await recommendCreators(
    business,
    1,
    async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
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

  assert.deepEqual(request.body, { business, creators });
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
