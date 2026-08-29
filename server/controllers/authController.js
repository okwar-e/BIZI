const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { createUser, findUserByEmail } = require('../models/userModel');

async function registerBusiness(req, res) {
  const { name, email, password, businessName, industry } = req.body;

  try {
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = await createUser({
      name,
      email,
      passwordHash,
      role: 'business',
    });

    const [businessResult] = await db.query(
      `INSERT INTO businesses (userId, businessName, industry) VALUES (?, ?, ?)`,
      [userId, businessName, industry || null]
    );

    return res.status(201).json({
      userId,
      businessId: businessResult.insertId,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
}

async function registerCreator(req, res) {
  const { name, email, password, publicHandle } = req.body;

  try {
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = await createUser({
      name,
      email,
      passwordHash,
      role: 'creator',
    });

    const [creatorResult] = await db.query(
      `INSERT INTO creators (userId, publicHandle) VALUES (?, ?)`,
      [userId, publicHandle || null]
    );

    return res.status(201).json({
      userId,
      creatorId: creatorResult.insertId,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  try {
    const user = await findUserByEmail(email);
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

module.exports = {
  registerBusiness,
  registerCreator,
  login,
};
