'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const campaignModel = require('../models/campaignModel');
const { amountToCents, centsToAmount, estimateOfferCents, validateCampaignBudget } = require('../services/campaignBudget');

test('campaign budget accepts bounded currency amounts and validates creator target', () => {
  assert.deepEqual(validateCampaignBudget({ totalBudget: 100000, currency: 'kes', targetCreatorCount: 5 }), {
    value: { totalBudget: 100000, totalBudgetCents: 10000000, currency: 'KES', targetCreatorCount: 5 },
  });
  assert.equal(validateCampaignBudget({ totalBudget: -1, currency: 'KES', targetCreatorCount: 5 }).error, 'totalBudget must be a non-negative amount with up to 2 decimal places');
  assert.match(validateCampaignBudget({ totalBudget: 10, currency: 'KES', targetCreatorCount: 0 }).error, /targetCreatorCount/);
  assert.match(validateCampaignBudget({ totalBudget: 10, currency: 'US', targetCreatorCount: 1 }).error, /currency/);
});

test('estimated offer uses campaign total divided by target count to cents', () => {
  assert.equal(estimateOfferCents(100000, 5), 2000000);
  assert.equal(estimateOfferCents('100.00', 3), 3333);
  assert.equal(centsToAmount(amountToCents('25000.25')), 25000.25);
});

test('campaign model stores total budget, currency, and target creator count', async () => {
  let inserted;
  const campaignId = await campaignModel.createCampaign(12, {
    nicheText: 'Food', targetAudience: 'Home cooks', totalBudget: 100000,
    currency: 'KES', targetCreatorCount: 5,
  }, {
    buildEmbedding: async () => '[0.1]',
    query: async (sql, params) => {
      inserted = { sql, params };
      return [{ insertId: 44 }];
    },
  });
  assert.equal(campaignId, 44);
  assert.match(inserted.sql, /totalBudget, currency, targetCreatorCount/);
  assert.deepEqual(inserted.params.slice(-3), [100000, 'KES', 5]);
});