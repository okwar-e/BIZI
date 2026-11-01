import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimatedOffer, formatMoney } from '../src/campaignBudget.js'

test('campaign estimate divides the total budget by creator target', () => {
  assert.equal(estimatedOffer(100000, 5), 20000)
  assert.equal(estimatedOffer(100, 3), 33.33)
  assert.equal(estimatedOffer(0, 5), 0)
  assert.equal(estimatedOffer(100, 0), 0)
})

test('money formatting labels KES as KSh and preserves other currency codes', () => {
  assert.match(formatMoney(20000, 'KES'), /^KSh 20,000\.00$/)
  assert.match(formatMoney(12.5, 'USD'), /^USD 12\.50$/)
})
