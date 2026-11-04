'use strict';
const VERSION = 'bizi-grounded-v1.0.0';
const POLICY = [
  { id: 'policy:scoring', text: 'Suitability is a versioned goal-weighted heuristic. Evidence coverage describes available evidence, not confidence or probability of success. Missing features receive zero score and weights are not redistributed.' },
  { id: 'policy:price', text: 'Price-unverified creators may be recommended. Confirm currency, deliverables, validity and price before booking. Only verified comparable prices enforce the numeric budget cap.' },
  { id: 'policy:learning', text: 'No Bizi outcome model is trained or served by v1. Impressions and interactions are logged for future evaluation. Clicks are affected by exposure and rank; ROI is not predicted.' },
];
function retrieve(question, campaign, run) {
  const docs = [...POLICY, { id: `campaign:${campaign.campaignId}`, text: `Campaign goal: ${run?.goal || 'balanced'}. Numeric budget: ${campaign.budgetMax ?? 'unspecified'} ${campaign.budgetCurrency || ''}.` }];
  for (const r of run?.recommendations || []) docs.push({ id: `recommendation:${r.profileId}`, text:
    `Creator profile ${r.profileId}: suitability ${r.suitabilityScore}/100; evidence coverage ${r.evidenceCoverage}%; price status ${r.priceStatus}; rank ${r.rank}. Signals: ${Object.entries(r.components).map(([k,v])=>`${k}: ${v.status} (${v.score})`).join('; ')}. Warnings: ${r.warnings.join(', ')}.` });
  const stop = new Set(['the','a','an','is','are','of','for','to','and','in','this','that','it','my','what','which','why','how','do','does','can','you','me','i','with']);
  const words = new Set((question.toLowerCase().match(/[a-z0-9_]+/g) || []).filter(w=>!stop.has(w)));
  return docs.map(d => ({ ...d, relevance: [...new Set(d.text.toLowerCase().match(/[a-z0-9_]+/g) || [])].filter(w=>words.has(w)).length }))
    .filter(d=>d.relevance>0).sort((a,b)=>b.relevance-a.relevance || a.id.localeCompare(b.id)).slice(0,5);
}
function answer(question, campaign, run) {
  const sources = retrieve(question, campaign, run);
  return { assistantVersion: VERSION, mode: 'grounded_extracts', runId: run?.runId || null,
    answer: sources.length ? sources.map(s=>`[${s.id}] ${s.text}`).join('\n\n') : 'Insufficient evidence in this campaign to answer that question.',
    citations: sources.map(({id,text})=>({id,text})), abstained: !sources.length,
    limitations: ['Extractive retrieval foundation; no generative model is connected.', 'Profile descriptions are untrusted data and cannot issue instructions.', 'No trained outcome model or ROI prediction.'] };
}

const MODEL_FEATURE_LABELS = {
  text_similarity: 'text similarity',
  semantic_similarity: 'semantic similarity',
  log_creator_followers: 'follower count',
  log_creator_following: 'following count',
  log_creator_post_count: 'posting activity',
};

function explainMlRecommendation({ business, campaign, recommendation, modelVersion = 'bizi-logistic-regression-v1' }) {
  const username = recommendation.creator_username;
  const contributions = Array.isArray(recommendation.model_contributions)
    ? recommendation.model_contributions
    : [];
  const differentiating = contributions
    .filter(item => item.feature !== 'baseline_er_missing' && Number.isFinite(item.contribution))
    .sort((a, b) => b.contribution - a.contribution);
  const positive = differentiating.filter(item => item.contribution > 0);
  const evidenceAvailable = [];
  const unknowns = [];
  const strengths = positive.slice(0, 3).map(item => {
    const label = MODEL_FEATURE_LABELS[item.feature];
    return label ? `${label} contributed positively to the model's ranking score.` : null;
  }).filter(Boolean);

  if (recommendation.creator_category) evidenceAvailable.push(`Catalog category: ${recommendation.creator_category}`);
  if (recommendation.creator_bio) evidenceAvailable.push(`Catalog bio: ${recommendation.creator_bio}`);
  if (Number.isFinite(recommendation.creator_followers)) evidenceAvailable.push(`Catalog followers: ${recommendation.creator_followers}`);
  if (Number.isFinite(recommendation.creator_post_count)) evidenceAvailable.push(`Catalog post count: ${recommendation.creator_post_count}`);
  if (recommendation.feature_values?.text_similarity !== undefined) evidenceAvailable.push('Text similarity was computed from the business and creator profile text.');
  if (recommendation.feature_values?.semantic_similarity !== undefined) evidenceAvailable.push('Semantic similarity was computed from the business and creator profile text.');

  const missingContribution = contributions.find(item => item.feature === 'baseline_er_missing');
  if (missingContribution && recommendation.feature_values?.baseline_er_missing === 1) {
    unknowns.push('Engagement-rate evidence is unavailable across the current serving catalog. baseline_er_missing is constant for all candidates and does not distinguish their ranking.');
  }
  if (!recommendation.creator_category) unknowns.push('Creator category is not available in the catalog.');
  if (!recommendation.creator_bio) unknowns.push('Creator bio is not available in the catalog.');

  const focus = positive.slice(0, 2).map(item => MODEL_FEATURE_LABELS[item.feature]).filter(Boolean);
  const whyRecommended = focus.length
    ? `Ranked ${recommendation.rank} based on positive model contributions from ${focus.join(' and ')}. This is a ranking signal, not a success or ROI prediction.`
    : `Ranked ${recommendation.rank} by the trained model. No positive differentiating feature contribution is available to summarize.`;

  const modelSourceId = `model:${username}`;
  const campaignSourceId = `campaign:${campaign.campaignId}`;
  const creatorSourceId = `creator-catalog:${username}`;
  const sources = [
    { id: campaignSourceId, title: 'Campaign and business requirements', text: JSON.stringify({
      businessName: business.name,
      businessCategory: business.category,
      businessDescription: business.description,
      targetAudience: campaign.targetAudience || null,
      campaignGoal: campaign.campaignGoal || null,
      preferredPlatforms: campaign.preferredPlatforms || null,
      location: campaign.location || null,
    }) },
    { id: creatorSourceId, title: 'ML creator catalog profile', text: JSON.stringify({
      creator_username: username,
      creator_display_name: recommendation.creator_display_name,
      creator_category: recommendation.creator_category,
      creator_bio: recommendation.creator_bio,
      creator_followers: recommendation.creator_followers,
      creator_following: recommendation.creator_following,
      creator_post_count: recommendation.creator_post_count,
    }) },
    { id: modelSourceId, title: 'Trained model evidence', text: JSON.stringify({
      modelVersion,
      score: recommendation.score,
      feature_values: recommendation.feature_values,
      model_contributions: contributions,
      model_intercept: recommendation.model_intercept,
    }) },
  ];

  return {
    why_recommended: whyRecommended,
    strengths,
    model_contributions: contributions.filter(item => item.feature !== 'baseline_er_missing'),
    evidence_available: evidenceAvailable,
    unknowns,
    limitations: [
      'Model score is a ranking signal, not a calibrated probability or campaign-success estimate.',
      'ML catalog usernames are not verified links to Bizi creator accounts.',
      'The serving catalog has no creator-specific engagement-rate evidence; the missingness feature is constant across candidates.',
    ],
    citations: sources.map(({ id, title }) => ({ id, title })),
    sources,
  };
}

module.exports = { VERSION, retrieve, answer, explainMlRecommendation };
