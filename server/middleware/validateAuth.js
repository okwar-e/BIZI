const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateBusinessRegister(req, res, next) {
  const { name, email, password, businessName } = req.body;
  const errors = [];

  if (!isNonEmptyString(name)) {
    errors.push('name is required');
  }

  if (!isNonEmptyString(email)) {
    errors.push('email is required');
  } else if (!emailRegex.test(email)) {
    errors.push('email is invalid');
  }

  if (!isNonEmptyString(password)) {
    errors.push('password is required');
  } else if (password.trim().length < 6) {
    errors.push('password must be at least 6 characters');
  }

  if (!isNonEmptyString(businessName)) {
    errors.push('businessName is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  return next();
}

function validateCreatorRegister(req, res, next) {
  const { name, email, password, publicHandle } = req.body;
  const errors = [];

  if (!isNonEmptyString(name)) {
    errors.push('name is required');
  }

  if (!isNonEmptyString(email)) {
    errors.push('email is required');
  } else if (!emailRegex.test(email)) {
    errors.push('email is invalid');
  }

  if (!isNonEmptyString(password)) {
    errors.push('password is required');
  } else if (password.trim().length < 6) {
    errors.push('password must be at least 6 characters');
  }

  if (!isNonEmptyString(publicHandle)) {
    errors.push('publicHandle is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  return next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = [];

  if (!isNonEmptyString(email)) {
    errors.push('email is required');
  }

  if (!isNonEmptyString(password)) {
    errors.push('password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  return next();
}

module.exports = {
  validateBusinessRegister,
  validateCreatorRegister,
  validateLogin,
};
