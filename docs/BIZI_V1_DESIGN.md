# Bizi v1 implementation and decisions

## Architecture inspected

The project uses CommonJS Express, MySQL through mysql2, JWT roles, and Gemini embeddings. Campaigns belong to businesses; profiles belong to creators. React currently contains the Vite starter screen. Existing uncommitted package, seed, data and ML work is preserved. The existing recommender and its routes remain the legacy baseline. The standalone ROI training files are not connected to this implementation.

The previous chat exposed user decisions but its assistant messages were inaccessible content references. The numerical defaults below are explicit new implementation choices consistent with those decisions, rather than recovered historical agreements.

## Exact score

Suitability = 100 × sum(weight × component score). Coverage = 100 × sum(weight × component evidence coverage). Both use fixed goal weights; missing values never cause redistribution. Coverage is a completeness/reliability indicator, not statistical confidence. Suitability is a heuristic index, not a success probability. Goal selection is explicit; free-text campaignGoal is not silently classified.

| Goal | Semantic | Engagement | Reach | Budget |
|---|---:|---:|---:|---:|
| awareness | .35 | .15 | .30 | .20 |
| engagement | .35 | .35 | .10 | .20 |
| conversion | .45 | .25 | .05 | .25 |
| balanced/default | .40 | .25 | .15 | .20 |

Conversion weights express a preference for fit and feasible cost. They do not imply conversion prediction. These weights, fallback discounts, 90-day verification freshness and 30-sample reference minimum are documented product defaults, not research-established constants. Evaluate them before changing their version.

Semantic: use a measured, monotone calibration curve mapping cosine to suitability, only when campaign and creator embeddings have matching model/task/version provenance, current vector SHA-256 hashes, equal valid dimensions, and an unexpired reference with provenance and at least 30 samples. Interpolate between observed anchors and clamp outside the anchor range. Never equate (cosine + 1)/2 with probability. Legacy embeddings have no trustworthy provenance. Without valid calibration, score = .35 × niche-token overlap / campaign niche-token count, coverage = .25; this is explicitly a lexical fallback. Missing niche text scores zero with zero coverage. Audience description is not independently scored or claimed as verified audience alignment.

Engagement: the reference must contain actual cohort observations, an explicit platform, follower interval, engagement definition, sample count, provenance and expiry. Multi-platform profiles do not enter a single-platform cohort. Score = (count below rate + .5 × count equal to rate) / sample count. Fresh verified rates use multiplier 1 and coverage 1. Unverified/self-reported rates use multiplier .5 and coverage .5. Verified evidence is fresh for 90 days and requires no discrepancy flag. An absent, expired or mismatched reference yields score zero, with coverage .5 for a usable verified rate or .25 for a self report; a missing/invalid rate gives zero coverage. Rates must be in percent units from 0 through 100 and the same denominator definition. There is no fabricated engagement distribution or universal '10% is ideal' mapping.

Reach: with explicit targetFollowers > 0 and a nonnegative count, score = .5 × min(1, log(1 + followers)/log(1 + target)); coverage .5 because the existing count is self-reported. Missing count or target gives zero score/coverage. This is a reach proxy, not verified impressions.

Budget: score and coverage are 1 only for a currently valid admin-verified quote with exactly matching currency and deliverable scope, within a specified numeric budgetMax. Otherwise both are zero. No free-text budgetRange parsing, currency conversion or price inference. Unknown, expired, unverified or incomparable price remains eligible with price_unverified. Confirm price before booking.

Known platform/location mismatches, flagged creators and verified comparable over-budget quotes are excluded. Missing platform/location stays eligible with visible uncertainty. An unspecified campaign constraint is not an exclusion. Ranking uses suitability, then coverage, then profile id for deterministic ties. Return five recommendations. All eligible candidate scores and exclusion reasons are retained internally in the run snapshot.

## Persistence and authorization

Run the existing base migration for a fresh database, then `node scripts/migrateRecommendationV1.js` from server. The additive migration is repeatable and creates five tables; it does not alter legacy tables or recommendations. No server start automatically migrates the database.

New prefix: `/api/recommendation-v1`. Every request requires a bearer token and a live database role check. Business routes join campaign ownership before fetching runs, events or assistant evidence. Admin routes are separate; businesses and creators cannot assert verification or calibration provenance. Existing legacy endpoints keep their existing behavior.

- GET/PUT `/:campaignId/settings`: PUT requires all five keys: goalKey, budgetMax, budgetCurrency, deliverableScope, targetFollowers. Unknown non-goal values are null. Currency is an uppercase three-letter code.
- POST `/:campaignId/runs`: persist immutable v1 snapshot plus a shadow ranking from the existing baseline; return runId and card fields. Empty rankings are successful runs. Operational failures return 500, not a fabricated empty success.
- GET `/:campaignId/runs/:runId`: fetch that campaign's run. Snapshot remains historical if campaign/profile data changes.
- POST `/:campaignId/events`: require caller-generated UUIDv4 eventId, runId, integer profileId, eventType and an empty payload for interactions. Types: impression, click, shortlist, contact, dismiss, outcome. Only profiles shown in the run may produce events. Interactions/outcomes require impressionId linking a matching impression by the same actor. Identical retries are idempotent; conflicting reuse returns 409.
- POST `/:campaignId/assistant`: `{question, runId?}` returns answer, citations, abstained, assistantVersion, mode and limitations. An unowned/unknown run fails closed.
- Admin PUT `/creator-evidence/:profileId`: replace the evidence object, allowed fields priceAmount, priceCurrency, priceScope, priceVerified, priceValidUntil, embeddingVersion, embeddingHash, engagementDefinition. Verification requires human/operator evidence, not merely user assertion. Existing verifiedEngagement and lastVerifiedAt remain existing database fields.
- Admin PUT `/campaign-provenance/:campaignId`: `{embeddingVersion, embeddingHash}`. Do not label unknown legacy vectors as a known model. Hash the parsed numeric array serialized with JSON.stringify. A changed vector invalidates provenance automatically.

Version identifiers are stored for algorithm, features, events, assistant and calibration artifact. Runs include weights, component values/statuses, rank, exclusions, hashes of inputs/calibration, baseline ranking and timestamp. Existing baseline is `legacy-50-50`; it retains its old limitations and is not advertised as calibrated.

## Real calibration artifacts

`BIZI_CALIBRATION_FILE` optionally points to an operator-controlled JSON file. It has a unique id and optional semantic and engagement objects. Each object requires kind, id, provenance, sampleCount >= 30 and future expiresAt. Semantic additionally requires embeddingVersion and anchors, each `[cosine, judgedSuitability]`, strictly increasing in cosine, nondecreasing in suitability. Engagement requires actual `values` matching sampleCount and cohort `{platform, minFollowers, maxFollowers, definition}`. No production fixture/reference file is shipped. Synthetic values only appear in unit tests and are clearly labelled there.

Build semantic anchors from independent relevance judgments for held-out campaign/creator pairs, recording model/task, labeling rubric, cohort and collection date. Build engagement cohorts only from verified comparable observations with a common rate definition; avoid mixed platforms/tiers or cherry-picked outcomes. Store the artifact immutably with its hash. The schema validation cannot prove that an operator supplied genuine observations: provenance review is operationally required. Calibration is ranking normalization, not outcome training.

## Learning later

Generating a recommendation is not an impression. Copilot must log an impression only when a card is actually visible. Store server-derived rank, goal, version, source and policy; never trust client-supplied rank or propensity. Deterministic v1 has null selectionPropensity: no invented randomized exposure probability. User actions and business-reported outcomes are observations, not verified causal labels. Outcome payload requires status, measurement, value when measured, a currency for revenue and an ordered past measurement window. Measurements allowed: none, impressions, clicks, conversions, revenue. 'ROI' is deliberately unsupported.

Use feature snapshots at decision time to prevent future-data leakage. Distinguish missing outcomes from measured zero, do not label unexposed/unselected creators as failures, deduplicate retries, separate demo/seed traffic before training, and split evaluation by time and campaign/business. Compare future models against legacy and v1 with relevance, coverage, exposure, subgroup and outcome metrics. Rank/selection bias remains; deterministic logs alone do not justify unbiased counterfactual estimates. Randomized exploration needs a separately reviewed serving policy and real recorded propensities. Train and deploy only after enough representative validated outcomes, held-out evaluation, and a versioned rollback path. No model is trained or ROI claimed in this change.

## Grounded assistant foundation

The implemented foundation is lexical retrieval plus deterministic cited extracts, with no generative API cost. Corpus: static policy, the owned campaign's structured goal/budget, and the selected owned run's structured recommendation evidence. Raw creator biographies, credentials, unrelated campaigns and arbitrary web documents never enter the corpus. HTML/profile instructions cannot control execution. Unknown topics abstain. Every returned extract has an allowlisted citation id and source text. The corpus intentionally omits free-text campaign/profile content and individual price/revenue estimates.

Before adding generation, preserve authorization before retrieval, treat retrieved text as untrusted data, require source ids for every factual claim, validate citations against the retrieved allowlist, abstain when evidence is insufficient, and test cross-tenant leakage, injection, unsupported ROI and stale evidence. This is a RAG foundation, not a completed generative RAG product.

## Research grounding and limits

- Covington et al., [Deep Neural Networks for YouTube Recommendations](https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/): motivates separating candidate selection and ranking. Bizi uses heuristic scoring, not that trained architecture.
- Joachims et al., [Unbiased Learning-to-Rank with Biased Feedback](https://arxiv.org/abs/1608.04468): motivates recording exposure and position and treating click feedback carefully. Bizi does not claim unbiased learning from deterministic logs.
- Lewis et al., [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401): motivates retrieval grounded in external evidence. Bizi currently implements cited extraction and a future generation boundary.

These sources motivate design patterns. They do not validate Bizi's weights, forecast ROI, or prove ranking quality. Current unit and route tests verify safety/behavior; a live MySQL integration and end-to-end UI check are additional deployment checks.
