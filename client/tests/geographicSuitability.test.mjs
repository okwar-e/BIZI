import { test } from 'node:test'
import assert from 'node:assert/strict'
import { geographicSuitability } from '../src/geographicSuitability.js'

const sampleCampaign = {
  campaignLocation: 'Nairobi, Kenya',
  targetMarket: 'Kenya',
  matchPhysicalLocation: true,
  matchAudienceMarket: true,
}

test('sample creator matching both explicitly requested named-place signals explains each basis', () => {
  const sampleCreator = {
    displayName: 'SAMPLE Creator - Nairobi',
    location: '  nairobi,   Kenya ',
    audienceLocations: 'Kenya\nUganda',
    audienceLocationCoverageComplete: true,
  }
  const result = geographicSuitability(sampleCampaign, sampleCreator)
  assert.equal(result.status, 'both')
  assert.equal(result.checks[0].status, 'match')
  assert.equal(result.checks[1].status, 'match')
  assert.match(result.checks[0].explanation, /not a distance estimate/)
})

test('sample creator with a different base place is a named-place mismatch, not a distance result', () => {
  const result = geographicSuitability(sampleCampaign, {
    displayName: 'SAMPLE Creator - Mombasa',
    location: 'Mombasa, Kenya',
    audienceLocations: 'Kenya',
    audienceLocationCoverageComplete: true,
  })
  assert.equal(result.status, 'audience')
  assert.equal(result.checks[0].status, 'mismatch')
  assert.match(result.checks[0].explanation, /distance is not measured/)
})

test('sample incomplete audience distribution is unknown rather than a mismatch', () => {
  const result = geographicSuitability(
    { targetMarket: 'Nairobi, Kenya', matchAudienceMarket: true },
    {
      displayName: 'SAMPLE Creator - incomplete insights',
      audienceLocations: 'Mombasa, Kenya',
      audienceLocationCoverageComplete: false,
    },
  )
  assert.equal(result.status, 'unknown')
  assert.equal(result.checks[0].status, 'unknown')
  assert.match(result.checks[0].explanation, /not a confirmed mismatch/)
})

test('sample complete audience distribution can report a genuine market mismatch', () => {
  const result = geographicSuitability(
    { targetMarket: 'Nairobi, Kenya', matchAudienceMarket: true },
    {
      displayName: 'SAMPLE Creator - complete insights',
      audienceLocations: 'Mombasa, Kenya',
      audienceLocationCoverageComplete: true,
    },
  )
  assert.equal(result.status, 'mismatch')
  assert.equal(result.checks[0].status, 'mismatch')
})

test('campaigns with no enabled geographic requirements remain unrestricted', () => {
  assert.deepEqual(geographicSuitability({}, { location: 'Nairobi' }), {
    status: 'unrestricted',
    label: 'No geographic restrictions',
  })
})
