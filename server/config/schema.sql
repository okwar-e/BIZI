CREATE TABLE users (
  userId INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  passwordHash VARCHAR(255) NOT NULL,
  role ENUM('business', 'creator', 'admin') NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE businesses (
  businessId INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  businessName VARCHAR(255) NOT NULL,
  industry VARCHAR(255),
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

CREATE TABLE creators (
  creatorId INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  publicHandle VARCHAR(255),
  verificationStatus ENUM('unverified', 'verified', 'flagged') DEFAULT 'unverified',
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

CREATE TABLE administrators (
  adminId INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);
