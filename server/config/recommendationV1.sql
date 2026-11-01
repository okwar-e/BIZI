CREATE TABLE IF NOT EXISTS campaign_recommendation_settings (
 campaignId INT PRIMARY KEY,
 settings JSON NOT NULL,
 updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (campaignId) REFERENCES campaigns(campaignId) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS creator_recommendation_evidence (
 profileId INT PRIMARY KEY,
 evidence JSON NOT NULL,
 updatedBy INT NOT NULL,
 updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (profileId) REFERENCES creator_profiles(profileId) ON DELETE CASCADE,
 FOREIGN KEY (updatedBy) REFERENCES users(userId)
);
CREATE TABLE IF NOT EXISTS campaign_embedding_provenance (
 campaignId INT PRIMARY KEY,
 provenance JSON NOT NULL,
 updatedBy INT NOT NULL,
 updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (campaignId) REFERENCES campaigns(campaignId) ON DELETE CASCADE,
 FOREIGN KEY (updatedBy) REFERENCES users(userId)
);
CREATE TABLE IF NOT EXISTS recommendation_runs_v1 (
 runId CHAR(36) PRIMARY KEY,
 campaignId INT NOT NULL,
 actorId INT NOT NULL,
 algorithmVersion VARCHAR(64) NOT NULL,
 snapshot JSON NOT NULL,
 createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX (campaignId, createdAt),
 FOREIGN KEY (campaignId) REFERENCES campaigns(campaignId) ON DELETE CASCADE,
 FOREIGN KEY (actorId) REFERENCES users(userId)
);
CREATE TABLE IF NOT EXISTS recommendation_events_v1 (
 eventId CHAR(36) PRIMARY KEY,
 runId CHAR(36) NOT NULL,
 profileId INT NOT NULL,
 actorId INT NOT NULL,
 eventType VARCHAR(32) NOT NULL,
 impressionId CHAR(36) NULL,
 payload JSON NOT NULL,
 createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX (runId, profileId, eventType),
 FOREIGN KEY (runId) REFERENCES recommendation_runs_v1(runId) ON DELETE CASCADE,
 FOREIGN KEY (profileId) REFERENCES creator_profiles(profileId) ON DELETE CASCADE,
 FOREIGN KEY (actorId) REFERENCES users(userId),
 FOREIGN KEY (impressionId) REFERENCES recommendation_events_v1(eventId)
);
