'use strict';
const NAMESPACE = 'bizi-complete-300-v1';
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
async function loadCreatorCohort(db, campaignId) {
  const [tags] = await db.query('SELECT namespace FROM demo_dataset_records WHERE entityType=? AND entityId=? ORDER BY namespace', ['campaign', String(campaignId)]);
  const complete = tags.some(t=>t.namespace===NAMESPACE);
  const [owners] = await db.query('SELECT u.email FROM campaigns c JOIN businesses b ON b.businessId=c.businessId JOIN users u ON u.userId=b.userId WHERE c.campaignId=?',[campaignId]);
  const simulated = tags.length>0 || /@(?:[^@]*\.)?synthetic\.test$/i.test(owners[0]?.email || '');
  const group = complete ? NAMESPACE : tags[0]?.namespace;
  const predicate = complete || group ? `cp.profileId IN (SELECT CAST(entityId AS UNSIGNED) FROM demo_dataset_records WHERE namespace=? AND entityType='profile')` : simulated ? `u.email LIKE '%synthetic.test' AND cp.profileId NOT IN (SELECT CAST(entityId AS UNSIGNED) FROM demo_dataset_records WHERE namespace=? AND entityType='profile')` : `u.email NOT LIKE '%synthetic.test' AND cp.profileId NOT IN (SELECT CAST(entityId AS UNSIGNED) FROM demo_dataset_records WHERE entityType='profile')`;
  const [rows] = await db.query(`SELECT cp.*,c.publicHandle,c.verificationStatus,e.evidence FROM creator_profiles cp
    JOIN creators c ON c.creatorId=cp.creatorId JOIN users u ON u.userId=c.userId LEFT JOIN creator_recommendation_evidence e ON e.profileId=cp.profileId
    WHERE ${predicate}`, complete||group?[group]:simulated?[NAMESPACE]:[]);
  return { simulated, rows: rows.map(({evidence,...p}) => ({...p,...(evidence ? decode(evidence) : {}),dataOrigin:simulated?'synthetic':'existing_profile'})) };
}
module.exports = { NAMESPACE, loadCreatorCohort };
