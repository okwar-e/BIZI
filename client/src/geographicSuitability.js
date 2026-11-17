function normalizePlace(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : ''
}

function isEnabled(value) {
  return value === true || value === 1 || value === '1'
}

export function hasCompleteAudienceLocationDistribution(creator) {
  return isEnabled(creator?.audienceLocationCoverageComplete)
}

export function audienceLocationList(value) {
  if (typeof value !== 'string') return []
  return value.split(/\r?\n/).map(location => location.trim()).filter(Boolean)
}

export function hasGeographicRequirements(campaign) {
  return isEnabled(campaign?.matchPhysicalLocation) || isEnabled(campaign?.matchAudienceMarket)
}

export function geographicSuitability(campaign, creator) {
  const checks = []
  if (isEnabled(campaign?.matchPhysicalLocation)) {
    const campaignPlace = normalizePlace(campaign.campaignLocation)
    const creatorPlace = normalizePlace(creator.location)
    checks.push({
      key: 'physical',
      status: !campaignPlace || !creatorPlace ? 'unknown' : campaignPlace === creatorPlace ? 'match' : 'mismatch',
      explanation: !creatorPlace
        ? 'Creator base location is not provided.'
        : !campaignPlace
          ? 'Campaign location is not provided.'
          : campaignPlace === creatorPlace
            ? `The creator base location matches the campaign place label (“${creator.location.trim()}”). This is not a distance estimate.`
            : `The place labels differ (“${creator.location.trim()}” vs. “${campaign.campaignLocation.trim()}”); distance is not measured.`,
    })
  }

  if (isEnabled(campaign?.matchAudienceMarket)) {
    const targetMarket = normalizePlace(campaign.targetMarket)
    const reportedLocations = audienceLocationList(creator.audienceLocations)
    const matches = targetMarket && reportedLocations.some(location => normalizePlace(location) === targetMarket)
    const complete = hasCompleteAudienceLocationDistribution(creator)
    checks.push({
      key: 'audience',
      status: !targetMarket || !reportedLocations.length ? 'unknown' : matches ? 'match' : complete ? 'mismatch' : 'unknown',
      explanation: !reportedLocations.length
        ? 'Audience location distribution is not provided.'
        : !targetMarket
          ? 'Campaign target market is not provided.'
          : matches
            ? `The reported audience locations include the target market (“${campaign.targetMarket.trim()}”).`
            : complete
              ? `The target market (“${campaign.targetMarket.trim()}”) is absent from the creator’s reported complete distribution.`
              : 'No exact target-market label match was found, but the reported audience distribution is incomplete, so this is not a confirmed mismatch.',
    })
  }

  if (!checks.length) return { status: 'unrestricted', label: 'No geographic restrictions' }
  const matched = checks.filter(check => check.status === 'match')
  if (matched.length === checks.length) return { status: 'both', label: 'All selected geographic signals align', checks }
  if (matched.length) {
    const label = matched.map(check => check.key === 'physical' ? 'Base location' : 'Audience market').join(' and ')
    return { status: matched.length > 1 ? 'both' : matched[0].key, label: `${label} aligns`, checks }
  }
  if (checks.every(check => check.status === 'mismatch')) {
    return { status: 'mismatch', label: 'Confirmed mismatch on selected signals', checks }
  }
  return { status: 'unknown', label: 'Not enough information to determine fit', checks }
}
