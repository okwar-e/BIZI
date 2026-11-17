'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const campaignModel = require('../models/campaignModel');
const { getCampaignFields, validateGeographicRequirements } = require('../controllers/campaignController');

test('sample campaign stores geographic concepts independently without changing legacy location', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return [{ insertId: 71, affectedRows: 1 }];
  };
  const buildEmbedding = async () => '[]';
  const sampleCampaign = {
    nicheText: 'SAMPLE campaign for Nairobi launch',
    targetAudience: 'Local consumers',
    budgetRange: 'KES 10,000',
    preferredPlatforms: 'Instagram',
    location: 'Legacy free-text value',
    campaignLocation: 'Nairobi, Kenya',
    targetMarket: 'Kenya',
    matchPhysicalLocation: true,
    matchAudienceMarket: true,
    campaignGoal: 'Sample launch',
    totalBudget: 10000,
    currency: 'KES',
    targetCreatorCount: 2,
  };

  const campaignId = await campaignModel.createCampaign(12, sampleCampaign, { query, buildEmbedding });
  assert.equal(campaignId, 71);
  assert.match(calls[0].sql, /campaignLocation, targetMarket, matchPhysicalLocation, matchAudienceMarket/);
  assert.deepEqual(calls[0].params.slice(6, 12), [
    'Legacy free-text value', 'Nairobi, Kenya', 'Kenya', true, true, 'Sample launch',
  ]);

  await campaignModel.updateCampaign(71, 12, sampleCampaign, { query, buildEmbedding });
  assert.match(calls[1].sql, /campaignLocation = \?, targetMarket = \?, matchPhysicalLocation = \?, matchAudienceMarket = \?/);
  assert.deepEqual(calls[1].params.slice(5, 11), [
    'Legacy free-text value', 'Nairobi, Kenya', 'Kenya', true, true, 'Sample launch',
  ]);
});

test('campaign geographic requirements are optional but cannot be enabled without their place', () => {
  const unrestricted = getCampaignFields({ nicheText: 'SAMPLE campaign with no location limits' });
  assert.equal(unrestricted.error, undefined);
  assert.equal(validateGeographicRequirements(unrestricted.value), null);
  assert.equal(validateGeographicRequirements(getCampaignFields({
    nicheText: 'SAMPLE campaign',
    matchPhysicalLocation: true,
  }).value), 'campaignLocation is required when physical location matching is enabled');
  assert.equal(validateGeographicRequirements(getCampaignFields({
    nicheText: 'SAMPLE campaign',
    matchAudienceMarket: true,
  }).value), 'targetMarket is required when audience market matching is enabled');
  assert.equal(getCampaignFields({
    nicheText: 'SAMPLE campaign',
    matchAudienceMarket: 'true',
  }).error, 'matchAudienceMarket must be a boolean');
});
