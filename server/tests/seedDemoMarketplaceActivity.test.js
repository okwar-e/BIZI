'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { NAMESPACE, CAMPAIGN_PLANS, isCompleteSeed, cleanup } = require('../scripts/seedDemoMarketplaceActivity');

function completeRecords() {
  return [
    ...Array.from({ length: 3 }, (_, index) => ({ entityType: 'campaign', entityId: String(index + 1) })),
    ...Array.from({ length: 12 }, (_, index) => ({ entityType: 'application', entityId: String(index + 10) })),
    { entityType: 'invitation', entityId: '30' },
  ];
}

function cleanupConnection(records, applicationIds, invitationIds) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT recordKey')) return [records];
      if (sql.startsWith('SELECT applicationId')) return [applicationIds.map(applicationId => ({ applicationId }))];
      if (sql.startsWith('SELECT invitationId')) return [invitationIds.map(invitationId => ({ invitationId }))];
      if (sql.startsWith('DELETE')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected cleanup query: ${sql}`);
    },
  };
}

test('complete demo seed provenance is recognized for idempotent reruns', () => {
  assert.equal(NAMESPACE, 'bizi-demo-activity-v1');
  assert.deepEqual(CAMPAIGN_PLANS.map(plan => plan.targetCreatorCount), [3, 4, 5]);
  assert.equal(isCompleteSeed(completeRecords()), true);
  assert.equal(isCompleteSeed(completeRecords().slice(0, -1)), false);
});

test('cleanup deletes only tagged activity after confirming no untagged children', async () => {
  const records = completeRecords();
  const applicationIds = records.filter(row => row.entityType === 'application').map(row => Number(row.entityId));
  const invitationIds = [30];
  const connection = cleanupConnection(records, applicationIds, invitationIds);

  const result = await cleanup(connection);

  assert.deepEqual(result, { campaignsDeleted: 3, applicationsDeleted: 12, invitationsDeleted: 1 });
  assert.deepEqual(connection.calls.filter(call => call.sql.startsWith('DELETE')).map(call => call.sql.split(' ')[2]), [
    'campaign_applications', 'campaign_invitations', 'campaigns', 'demo_dataset_records',
  ]);
});

test('cleanup refuses to remove a campaign that has untagged applications', async () => {
  const records = completeRecords();
  const applicationIds = records.filter(row => row.entityType === 'application').map(row => Number(row.entityId));
  const connection = cleanupConnection(records, [...applicationIds, 999], [30]);

  await assert.rejects(cleanup(connection), /activity not created by this seed/);
  assert.equal(connection.calls.some(call => call.sql.startsWith('DELETE')), false);
});