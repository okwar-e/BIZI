'use strict';

function amountToCents(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{1,12})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}

function centsToAmount(cents) {
  return Number((cents / 100).toFixed(2));
}

function estimateOfferCents(totalBudget, targetCreatorCount) {
  const cents = amountToCents(totalBudget);
  if (cents === null || !Number.isInteger(targetCreatorCount) || targetCreatorCount < 1) return null;
  return Math.round(cents / targetCreatorCount);
}

function validateCampaignBudget(body = {}, { allowDefaults = false } = {}) {
  const totalBudgetValue = body.totalBudget === undefined && allowDefaults ? 0 : body.totalBudget;
  const totalBudgetCents = amountToCents(totalBudgetValue);
  if (totalBudgetCents === null) return { error: 'totalBudget must be a non-negative amount with up to 2 decimal places' };

  const targetCreatorCount = body.targetCreatorCount === undefined && allowDefaults ? 1 : Number(body.targetCreatorCount);
  if (!Number.isInteger(targetCreatorCount) || targetCreatorCount < 1 || targetCreatorCount > 10000) {
    return { error: 'targetCreatorCount must be an integer from 1 to 10000' };
  }

  const currencyValue = body.currency === undefined && allowDefaults ? 'KES' : body.currency;
  const currency = typeof currencyValue === 'string' ? currencyValue.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(currency)) return { error: 'currency must be a 3-letter currency code' };

  return { value: { totalBudget: centsToAmount(totalBudgetCents), totalBudgetCents, currency, targetCreatorCount } };
}

module.exports = { amountToCents, centsToAmount, estimateOfferCents, validateCampaignBudget };