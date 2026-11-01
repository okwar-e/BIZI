'use strict';
const VERSION = 'bizi-v1.1.0';
const crypto = require('node:crypto');
const WEIGHTS = Object.freeze({
  awareness: { semantic: .35, engagement: .15, reach: .30, budget: .20 },
  engagement: { semantic: .35, engagement: .35, reach: .10, budget: .20 },
  conversion: { semantic: .45, engagement: .25, reach: .05, budget: .25 },
  balanced: { semantic: .40, engagement: .25, reach: .15, budget: .20 },
});
const clamp = x => Math.max(0, Math.min(1, x));
const round = x => Math.round(x * 10000) / 10000;
const number = x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : null;
const tokens = s => [...new Set(String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])];
const list = s => String(s || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
const signal = (score, coverage, status, raw = null) => ({ score: round(score), coverage, status, raw });

function validReference(ref, kind, now) {
  return ref && ref.kind === kind && typeof ref.id === 'string' && ref.id.length > 0
    && typeof ref.provenance === 'string' && ref.provenance.length > 0
    && Number.isInteger(ref.sampleCount) && ref.sampleCount >= 30
    && Number.isFinite(Date.parse(ref.expiresAt)) && Date.parse(ref.expiresAt) > now;
}
function vector(value) {
  try { const v = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'number' && Number.isFinite(x)) && v.some(x => x !== 0) ? v : null;
  } catch { return null; }
}
function cosine(a, b) {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const norm = Math.sqrt(a.reduce((s,x) => s+x*x,0)) * Math.sqrt(b.reduce((s,x) => s+x*x,0));
  return Number.isFinite(dot / norm) ? Math.max(-1, Math.min(1, dot / norm)) : null;
}
function semantic(campaign, creator, reference, now) {
  // Synthetic latent vectors and references cannot become genuine calibration evidence.
  if (creator.dataOrigin === 'synthetic') reference = null;
  const a = vector(campaign.nicheEmbedding), b = vector(creator.nicheEmbedding);
  const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
  // Legacy vectors have no provenance: never silently assume the same model/task.
  if (a && b && a.length === b.length && campaign.embeddingHash === hash(a) && creator.embeddingHash === hash(b)
    && campaign.embeddingVersion && campaign.embeddingVersion === creator.embeddingVersion
    && validReference(reference, 'semantic', now) && reference.embeddingVersion === campaign.embeddingVersion) {
    const anchors = reference.anchors;
    if (Array.isArray(anchors) && anchors.length >= 2 && anchors.every((p,i) =>
      Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && p[0] >= -1 && p[0] <= 1
      && Number.isFinite(p[1]) && p[1] >= 0 && p[1] <= 1 && (!i || (p[0] > anchors[i-1][0] && p[1] >= anchors[i-1][1])))) {
      const raw = cosine(a,b);
      if (raw !== null) {
        let score = anchors[0][1];
        if (raw >= anchors.at(-1)[0]) score = anchors.at(-1)[1];
        else for (let i=1;i<anchors.length;i++) if (raw <= anchors[i][0]) {
          const [x,y] = anchors[i-1], [xx,yy] = anchors[i];
          score = y + clamp((raw-x)/(xx-x))*(yy-y); break;
        }
        return signal(score, 1, 'calibrated_semantic', { cosine: round(raw), referenceId: reference.id });
      }
    }
  }
  const aText = tokens(campaign.nicheText), bText = tokens(creator.niche);
  if (!aText.length || !bText.length) return signal(0, 0, 'missing_niche');
  const overlap = aText.filter(t => bText.includes(t)).length / aText.length;
  // A transparent lexical fallback, not a semantic probability or audience match.
  return signal(.35 * overlap, .25, 'uncalibrated_lexical_fallback', { nicheTokenOverlap: round(overlap) });
}
function engagement(creator, reference, now) {
  if (creator.dataOrigin === 'synthetic') reference = null;
  const verified = number(creator.verifiedEngagement);
  const fresh = Number.isFinite(Date.parse(creator.lastVerifiedAt)) && now - Date.parse(creator.lastVerifiedAt) >= 0
    && now - Date.parse(creator.lastVerifiedAt) <= 90*86400000 && !creator.verificationDiscrepancyFlag;
  const reliable = verified !== null && verified <= 100 && fresh;
  const raw = reliable ? verified : number(creator.selfReportedEngagement);
  if (raw === null || raw > 100) return signal(0, 0, 'missing_or_invalid_engagement');
  const refs = reference?.values;
  const tier = number(creator.followerCount);
  const cohort = reference?.cohort;
  const matches = cohort && list(creator.platforms).length === 1 && list(creator.platforms)[0] === cohort.platform
    && tier !== null && tier >= cohort.minFollowers && tier <= cohort.maxFollowers
    && creator.engagementDefinition === cohort.definition;
  if (validReference(reference, 'engagement', now) && matches && Array.isArray(refs) && refs.length === reference.sampleCount
    && refs.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100)) {
    const percentile = (refs.filter(x => x < raw).length + .5*refs.filter(x => x === raw).length)/refs.length;
    return signal(percentile*(reliable ? 1 : .5), reliable ? 1 : .5, reliable ? 'verified_cohort_percentile' : 'self_reported_discounted_percentile', { rate: raw, referenceId: reference.id });
  }
  return signal(0, reliable ? .5 : .25, 'uncalibrated_engagement_no_reference', { rate: raw, verified: reliable });
}
function eligibility(campaign, creator) {
  const warnings = [], platforms = list(campaign.preferredPlatforms), cp = list(creator.platforms);
  if (platforms.length && cp.length && !platforms.some(x => cp.includes(x))) return { eligible: false, reason: 'platform_mismatch' };
  if (platforms.length && !cp.length) warnings.push('platform_unverified');
  const location = String(campaign.location || '').trim().toLowerCase(), cl = String(creator.location || '').trim().toLowerCase();
  if (location && cl && location !== cl) return { eligible: false, reason: 'location_mismatch' };
  if (location && !cl) warnings.push('location_unverified');
  if (creator.verificationStatus === 'flagged') return { eligible: false, reason: 'creator_flagged' };
  const price = number(creator.priceAmount), budget = number(campaign.budgetMax);
  const confirmed = creator.dataOrigin !== 'synthetic' && price !== null && creator.priceVerified === true && typeof creator.priceScope === 'string' && creator.priceScope.length > 0 && creator.priceScope === campaign.deliverableScope
    && creator.priceCurrency && creator.priceCurrency === campaign.budgetCurrency
    && Date.parse(creator.priceValidUntil) > campaign.now;
  if (confirmed && budget !== null && price > budget) return { eligible: false, reason: 'over_budget' };
  if (!confirmed) warnings.push('price_unverified');
  if (budget === null) warnings.push('budget_unspecified');
  return { eligible: true, warnings, priceStatus: confirmed ? 'verified' : 'price_unverified', price, budget, confirmed };
}
function rank(campaign, creators, options = {}) {
  const now = options.now ?? Date.now();
  const goal = Object.hasOwn(WEIGHTS, campaign.goalKey) ? campaign.goalKey : 'balanced';
  const weights = WEIGHTS[goal], excluded = [], scored = [];
  for (const creator of creators) {
    const filter = eligibility({ ...campaign, now }, creator);
    if (!filter.eligible) { excluded.push({ profileId: creator.profileId, reason: filter.reason }); continue; }
    const followers = number(creator.followerCount), target = number(campaign.targetFollowers);
    const components = {
      semantic: semantic(campaign, creator, options.calibration?.semantic, now),
      engagement: engagement(creator, options.calibration?.engagement, now),
      reach: followers !== null && target > 0 ? signal(.5*clamp(Math.log1p(followers)/Math.log1p(target)), .5, 'self_reported_reach_proxy', { followers, target }) : signal(0,0,'missing_reach_target_or_followers'),
      budget: filter.confirmed && filter.budget !== null ? signal(1,1,'verified_within_budget', { price: filter.price, budget: filter.budget }) : signal(0,0,'price_or_budget_unverified'),
    };
    const suitabilityScore = round(100*Object.keys(weights).reduce((s,k) => s+weights[k]*components[k].score,0));
    const evidenceCoverage = round(100*Object.keys(weights).reduce((s,k) => s+weights[k]*components[k].coverage,0));
    scored.push({ profileId: creator.profileId, publicHandle: creator.publicHandle || null,
      dataOrigin: creator.dataOrigin || 'existing_profile',
      fieldCompleteness: Math.round(100 * [creator.niche,creator.audienceDescription,creator.platforms,creator.location,creator.followerCount,creator.selfReportedEngagement,creator.engagementDefinition,creator.priceAmount,creator.priceCurrency,creator.priceScope,creator.priceValidUntil,creator.nicheEmbedding].filter(x=>x!==null&&x!==undefined&&x!=='').length/12),
      profileSummary: {niche:creator.niche||null,audience:creator.audienceDescription||null,platforms:creator.platforms||null,location:creator.location||null,followers:number(creator.followerCount),selfReportedEngagement:number(creator.selfReportedEngagement),quote:number(creator.priceAmount),currency:creator.priceCurrency||null,scope:creator.priceScope||null},
      algorithmVersion: VERSION, goal, weights, components, suitabilityScore, evidenceCoverage,
      priceStatus: filter.priceStatus, warnings: [...filter.warnings, ...Object.values(components).filter(x => x.coverage < 1).map(x => x.status)],
      explanationText: `${suitabilityScore}/100 suitability; ${evidenceCoverage}% evidence coverage. Heuristic ranking, not a probability or ROI prediction.` });
  }
  scored.sort((a,b) => b.suitabilityScore-a.suitabilityScore || b.evidenceCoverage-a.evidenceCoverage || Number(a.profileId)-Number(b.profileId));
  return { algorithmVersion: VERSION, goal, weights, calibrationVersion: options.calibration?.id || null,
    policy: 'deterministic_no_exploration', candidateCount: creators.length, eligibleCount: scored.length, excluded,
    recommendations: scored.slice(0, options.limit ?? 5).map((x,i) => ({ ...x, rank: i+1, selectionPropensity: null })) };
}
module.exports = { VERSION, WEIGHTS, rank, semantic, engagement, eligibility, validReference };
