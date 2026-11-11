'use strict';

const features = [
  { id: 'text_similarity', text: 'TF-IDF cosine similarity between campaign/business text and creator display name, category, and sanitized bio.' },
  { id: 'semantic_similarity', text: 'Cosine similarity between sentence-transformer embeddings of the same campaign/business and creator text.' },
  { id: 'log_creator_followers', text: 'Natural logarithm of one plus the catalog follower count.' },
  { id: 'log_creator_following', text: 'Natural logarithm of one plus the catalog following count.' },
  { id: 'log_creator_post_count', text: 'Natural logarithm of one plus the catalog post count.' },
  { id: 'baseline_er_missing', text: 'Missing historical engagement-rate indicator. It is constant at 1 for the current serving catalog and does not distinguish creators.' },
];

module.exports = {
  version: 'bizi-random-forest-v1',
  modelType: 'Trained Random Forest recommendation model',
  formula: 'The Node API sends owned campaign/business text to FastAPI. FastAPI builds the configured six-feature vector and ranks creators using the saved Random Forest pipeline, which imputes missing feature values.',
  features,
  limitations: [
    'Model scores are ranking values, not calibrated probabilities, performance guarantees, or outcome predictions.',
    'The current 2,362-profile serving catalog has no creator-specific engagement-rate evidence; baseline_er_missing is constant and is not a ranking differentiator.',
    'ML catalog identities are separate from registered Bizi creator accounts; no identity mapping exists.',
    'The model does not guarantee campaign performance or replace business judgement.',
    'Instagram integration and payment processing are not implemented.',
  ],
};
