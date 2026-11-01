'use strict';
const {VERSION,WEIGHTS}=require('./recommendationV1');
module.exports = {
  version:VERSION,weights:WEIGHTS,
  formula:'Suitability = 100 × Σ(goal weight × component score). Evidence coverage = 100 × Σ(goal weight × evidence coverage). Missing weights are never redistributed.',
  components:[
    {id:'semantic',text:'Matching valid embeddings require model/task/version provenance, current vector hashes and a genuine unexpired calibration curve. Otherwise niche-token overlap is multiplied by 0.35 and coverage is 0.25. This fallback is lexical, not semantic confidence or verified audience alignment.'},
    {id:'engagement',text:'Use the empirical midrank percentile of a genuine platform/follower/definition-matched cohort. Fresh verified rates receive full weight; self reports receive a 0.5 discount. Without a valid reference, score is zero even when a rate is populated. Rates must use the same percentage denominator.'},
    {id:'reach',text:'With an explicit follower target, score is 0.5 × min(1, log(1+followers)/log(1+target)). Coverage is 0.5 because the current follower field is self-reported. Missing target/count scores zero.'},
    {id:'budget',text:'Full score requires a currently valid verified quote within budget with exactly matching currency and deliverable scope. Unknown/unverified/incomparable prices remain eligible and score zero, with a price-unverified warning. Synthetic quotes are never treated as real verification.'},
  ],
  exclusions:['Known platform mismatch','Known required-location mismatch','Flagged creator','Fresh verified comparable quote over budget'],
  tieBreak:'Descending suitability, then descending evidence coverage, then ascending profile id. Return five.',
  limitations:['Weights and thresholds are documented product defaults, not experimentally validated constants.','Suitability is not a probability and evidence coverage is not statistical confidence.','A complete synthetic record is not verified evidence. Synthetic vectors are never production calibration.','No trained outcome/ROI model is served. Demo traffic must be excluded from learning.'],
};
