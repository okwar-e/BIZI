const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const creatorProfileRoutes = require('./routes/creatorProfileRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const database = require('./config/db');
const { createRouter: createMlRecommendationRouter, warmRecommendationCache } = require('./routes/mlRecommendationRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.get('/health', async (_req, res) => {
  try {
    await database.query('SELECT 1');
    return res.status(200).json({ status: 'ok' });
  } catch {
    return res.status(503).json({ status: 'unavailable' });
  }
});
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
app.use('/api/campaigns', createMlRecommendationRouter({
  express,
  db: database,
  verifyToken: require('./middleware/authMiddleware').verifyToken,
  requireRole: require('./middleware/roleMiddleware').requireRole,
}));
app.use('/api/assistant', require('./routes/biziAssistantRoutes'));

app.listen(PORT, (error) => {
  if (error) {
    console.error('Unable to start Bizi backend:', error.code || 'listen failed');
    process.exitCode = 1;
    return;
  }
  console.log(`Server running on port ${PORT}`);
  warmRecommendationCache(database).catch((warmupError) => {
    console.error('Unable to warm recommendation cache:', warmupError.message);
  });
});
