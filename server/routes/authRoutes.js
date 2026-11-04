const express = require('express');
const {
  registerBusiness,
  registerCreator,
  login,
  getSession,
} = require('../controllers/authController');
const {
  validateBusinessRegister,
  validateCreatorRegister,
  validateLogin,
} = require('../middleware/validateAuth');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register/business', validateBusinessRegister, registerBusiness);
router.post('/register/creator', validateCreatorRegister, registerCreator);
router.post('/login', validateLogin, login);
router.get('/session', verifyToken, getSession);

module.exports = router;
