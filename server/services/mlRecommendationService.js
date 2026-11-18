'use strict';

class MlServiceError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.name = 'MlServiceError';
    this.statusCode = statusCode;
  }
}

function validateRecommendationResponse(payload, topN) {
  if (!payload || !Array.isArray(payload.recommendations) || payload.recommendations.length > topN) {
    throw new MlServiceError('Recommendation service returned an invalid response', 502);
  }

  const valid = payload.recommendations.every((recommendation, index) =>
    recommendation
    && typeof recommendation.creator_username === 'string'
    && recommendation.creator_username.trim().length > 0
    && Number.isInteger(recommendation.rank)
    && recommendation.rank === index + 1
    && Number.isFinite(recommendation.score)
    && (recommendation.is_sample_account === undefined || typeof recommendation.is_sample_account === 'boolean')
    && Number.isInteger(recommendation.creator_id)
  );
  if (!valid) {
    throw new MlServiceError('Recommendation service returned an invalid response', 502);
  }

  return payload.recommendations;
}

function getMlServiceHeaders() {
  const token = process.env.BIZI_ML_SERVICE_TOKEN;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function recommendCreators(business, topN = 10, fetchImpl = fetch, options = {}) {
  const creators = options.creators || null;
  const serviceUrl = (process.env.BIZI_ML_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
  const configuredTimeout = Number(process.env.BIZI_ML_SERVICE_TIMEOUT_MS || 90000);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 90000;

  try {
    const health = await fetchImpl(`${serviceUrl}/health`, {
      headers: getMlServiceHeaders(),
      signal: AbortSignal.timeout(Math.min(timeoutMs, 3000)),
    });
    if (health.ok) {
      const state = await health.json();
      if (state.embedding_cache_warming) {
        throw new MlServiceError('Recommendation service is warming up, try again shortly');
      }
    }
  } catch (error) {
    if (error instanceof MlServiceError) throw error;
  }

  let response;
  try {
    response = await fetchImpl(`${serviceUrl}/recommend?top_n=${topN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getMlServiceHeaders() },
      body: JSON.stringify({
        business,
        ...(Array.isArray(creators) && creators.length > 0 ? { creators } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    console.log(error)
    throw new MlServiceError(
      error?.name === 'TimeoutError'
        ? 'Recommendation service timed out'
        : 'Recommendation service is unavailable'
    );
  }

  if (!response.ok) {
    throw new MlServiceError('Recommendation service is unavailable');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new MlServiceError('Recommendation service returned an invalid response', 502);
  }

  return validateRecommendationResponse(payload, topN);
}

module.exports = {
  MlServiceError,
  getMlServiceHeaders,
  recommendCreators,
  validateRecommendationResponse,
};