const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const creatorProfileRoutes = require('./routes/creatorProfileRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/creator-profile', creatorProfileRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
