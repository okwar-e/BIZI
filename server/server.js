const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const creatorProfileRoutes = require('./routes/creatorProfileRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/creator-profile', creatorProfileRoutes);
app.use('/api/creator', require('./routes/creatorPlatformRoutes').createRouter({
  express,
  db: require('./config/db'),
  verifyToken: require('./middleware/authMiddleware').verifyToken,
}));
app.use('/api/business', require('./routes/businessMarketplaceRoutes').createRouter({
  express,
  db: require('./config/db'),
  verifyToken: require('./middleware/authMiddleware').verifyToken,
}));
app.use('/api/campaigns', campaignRoutes);
app.use('/api/campaigns', recommendationRoutes);
app.use('/api/campaigns', require('./routes/mlRecommendationRoutes').createRouter({
  express,
  db: require('./config/db'),
  verifyToken: require('./middleware/authMiddleware').verifyToken,
  requireRole: require('./middleware/roleMiddleware').requireRole,
}));
app.use('/api/assistant', require('./routes/biziAssistantRoutes'));
const { createRouter } = require('./routes/recommendationV1Routes');
app.use('/api/recommendation-v1', createRouter({
  express,
  db: require('./config/db'),
  verifyToken: require('./middleware/authMiddleware').verifyToken,
  calibration: require('./services/calibrationRegistry').loadCalibration(),
  baseline: require('./services/recommendationEngine').generateRecommendations,
}));

app.listen(PORT, (error) => {
  if (error) {
    console.error('Unable to start Bizi backend:', error.code || 'listen failed');
    process.exitCode = 1;
    return;
  }
  console.log(`Server running on port ${PORT}`);
});
