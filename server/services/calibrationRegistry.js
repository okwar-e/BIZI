'use strict';
const fs = require('node:fs');
function loadCalibration() {
  const file = process.env.BIZI_CALIBRATION_FILE;
  if (!file) return null;
  // Operator-controlled artifact only. No uploaded/browser-provided distributions.
  const value = JSON.parse(fs.readFileSync(file,'utf8'));
  if (!value || typeof value.id !== 'string' || !value.id || (!value.semantic && !value.engagement)) throw new Error('Invalid calibration registry');
  return value;
}
module.exports = {loadCalibration};
