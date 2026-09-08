CREATE TABLE IF NOT EXISTS users (
  userId INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  passwordHash VARCHAR(255) NOT NULL,
  role ENUM('business', 'creator', 'admin') NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS businesses (
  businessId INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  businessName VARCHAR(255) NOT NULL,
  industry VARCHAR(255),
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creators (
  creatorId INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  publicHandle VARCHAR(255),
  verificationStatus ENUM('unverified', 'verified', 'flagged') DEFAULT 'unverified',
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS administrators (
  adminId INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_profiles (
  profileId INT PRIMARY KEY AUTO_INCREMENT,
  creatorId INT NOT NULL,
  niche VARCHAR(255),
  audienceDescription TEXT,
  nicheEmbedding JSON DEFAULT NULL,
  platforms VARCHAR(255),
  location VARCHAR(255),
  selfReportedEngagement FLOAT DEFAULT NULL,
  verifiedEngagement FLOAT DEFAULT NULL,
  followerCount INT DEFAULT NULL,
  verificationDiscrepancyFlag BOOLEAN DEFAULT FALSE,
  lastVerifiedAt TIMESTAMP NULL DEFAULT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creatorId) REFERENCES creators(creatorId) ON DELETE CASCADE
);
