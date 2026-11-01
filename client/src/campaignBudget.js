export function estimatedOffer(totalBudget, targetCreatorCount) {
  const budget = Number(totalBudget)
  const count = Number(targetCreatorCount)
  if (!Number.isFinite(budget) || budget <= 0 || !Number.isInteger(count) || count < 1) return 0
  return Math.round((budget / count) * 100) / 100
}

export function formatMoney(amount, currency = 'KES') {
  const symbol = currency === 'KES' ? 'KSh' : currency
  return `${symbol} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}