'use strict';

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\w)\+?[\d(][\d().\s-]{7,}\d(?!\w)/g;

function sanitizeContactDetails(value) {
  if (typeof value !== 'string') return value;
  const withoutEmails = value.replace(EMAIL_PATTERN, '[contact removed]');
  return withoutEmails.replace(PHONE_PATTERN, match =>
    (match.match(/\d/g) || []).length >= 9 ? '[contact removed]' : match
  ).replace(/\s+/g, ' ').trim();
}

module.exports = { sanitizeContactDetails };