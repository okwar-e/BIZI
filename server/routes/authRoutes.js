const express = require('express');
const {
  registerBusiness,
  registerCreator,
  login,
} = require('../controllers/authController');
const {
  validateBusinessRegister,
  validateCreatorRegister,
  validateLogin,
} = require('../middleware/validateAuth');

const router = express.Router();

router.post('/register/business', validateBusinessRegister, registerBusiness);
router.post('/register/creator', validateCreatorRegister, registerCreator);
router.post('/login', validateLogin, login);

module.exports = router;
