'use strict';

async function validateCampaignApplication(connection, { campaignId, creatorId, applicantUserId }) {
  const [openCampaign] = await connection.query(
    `SELECT c.campaignId FROM campaigns c JOIN businesses b ON b.businessId = c.businessId
     WHERE c.campaignId = ? AND c.publicationStatus = 'open' AND b.userId <> ? LIMIT 1 FOR UPDATE`,
    [campaignId, applicantUserId]
  );
  if (!openCampaign.length) return { statusCode: 404, error: 'Campaign not found' };

  const [profiles] = await connection.query(
    'SELECT profileId FROM creator_profiles WHERE creatorId = ? LIMIT 1',
    [creatorId]
  );
  if (!profiles.length) return { statusCode: 400, error: 'Complete your creator profile before applying' };

  const [acceptedInvitations] = await connection.query(
    "SELECT invitationId FROM campaign_invitations WHERE campaignId = ? AND creatorId = ? AND status = 'accepted' LIMIT 1",
    [campaignId, creatorId]
  );
  if (acceptedInvitations.length) {
    return { statusCode: 409, error: 'You already accepted an invitation for this campaign' };
  }

  return null;
}

module.exports = { validateCampaignApplication };