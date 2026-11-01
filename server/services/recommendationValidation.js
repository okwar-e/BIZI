'use strict';
const { WEIGHTS } = require('./recommendationV1');
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const amount = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1e12;
function validateSettings(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
  const allowed = ['goalKey','budgetMax','budgetCurrency','deliverableScope','targetFollowers'];
  return Object.keys(b).every(k=>allowed.includes(k)) && Object.hasOwn(WEIGHTS,b.goalKey)
    && (b.budgetMax === null || amount(b.budgetMax))
    && (b.targetFollowers === null || (amount(b.targetFollowers) && b.targetFollowers > 0))
    && (b.budgetCurrency === null || /^[A-Z]{3}$/.test(b.budgetCurrency))
    && (b.deliverableScope === null || (typeof b.deliverableScope === 'string' && b.deliverableScope.trim().length > 0 && b.deliverableScope.length <= 200));
}
function validateEvidence(b) {
  const keys = ['priceAmount','priceCurrency','priceScope','priceVerified','priceValidUntil','embeddingVersion','embeddingHash','engagementDefinition'];
  return b && typeof b === 'object' && !Array.isArray(b) && Object.keys(b).every(k=>keys.includes(k))
    && (b.priceAmount === undefined || b.priceAmount === null || amount(b.priceAmount))
    && (b.priceCurrency === undefined || (typeof b.priceCurrency === 'string' && /^[A-Z]{3}$/.test(b.priceCurrency)))
    && (b.priceVerified === undefined || typeof b.priceVerified === 'boolean')
    && (b.embeddingHash === undefined || (typeof b.embeddingHash === 'string' && /^[0-9a-f]{64}$/.test(b.embeddingHash)))
    && (b.priceValidUntil === undefined || (typeof b.priceValidUntil === 'string' && Number.isFinite(Date.parse(b.priceValidUntil))))
    && ['priceScope','embeddingVersion','engagementDefinition'].every(k=>b[k]===undefined || (typeof b[k]==='string' && b[k].length>0 && b[k].length<=200));
}
function validateEvent(b) {
  if (!b || !uuid(b.eventId) || !uuid(b.runId) || !Number.isInteger(b.profileId) || b.profileId <= 0) return false;
  if (!['impression','click','shortlist','contact','dismiss','outcome'].includes(b.eventType)) return false;
  if (b.eventType !== 'impression' && !uuid(b.impressionId)) return false;
  if (b.eventType === 'impression' && b.impressionId != null) return false;
  const p = b.payload || {};
  if (typeof p !== 'object' || Array.isArray(p)) return false;
  if (b.eventType !== 'outcome') return Object.keys(p).length === 0;
  return Object.keys(p).every(k=>['status','measurement','value','currency','windowStart','windowEnd'].includes(k))
    && ['completed','cancelled'].includes(p.status)
    && ['none','impressions','clicks','conversions','revenue'].includes(p.measurement)
    && (p.measurement === 'none' ? p.value == null : amount(p.value))
    && (p.measurement !== 'revenue' || (typeof p.currency==='string' && /^[A-Z]{3}$/.test(p.currency)))
    && Number.isFinite(Date.parse(p.windowStart)) && Number.isFinite(Date.parse(p.windowEnd))
    && Date.parse(p.windowStart) <= Date.parse(p.windowEnd) && Date.parse(p.windowEnd) <= Date.now();
}
module.exports = { uuid, validateSettings, validateEvidence, validateEvent };
