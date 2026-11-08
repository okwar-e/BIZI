const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { findUserByEmail } = require('../models/userModel');

const { createRegistrationService } = require('../services/registrationService');
const registerAccount = createRegistrationService({ db, hashPassword: password => bcrypt.hash(password, 10) });
function registrationHandler(role) {
  return async (req, res) => {
    try { return res.status(201).json(await registerAccount(role, req.body)); }
    catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already exists' });
      return res.status(500).json({ message: 'Account could not be created. Please try again.' });
    }
  };
}
const registerBusiness = registrationHandler('business');
const registerCreator = registrationHandler('creator');
async function login(req, res) {
  const { email, password } = req.body;

  try {
    const user = await findUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        userId: user.userId,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      token,
      role: user.role,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
}

function getSession(req, res) {
  return res.status(200).json({
    userId: req.user.userId,
    role: req.user.role,
  });
}

module.exports = {
  registerBusiness,
  registerCreator,
  login,
  getSession,
};
