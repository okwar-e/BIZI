'use strict';
const crypto = require('node:crypto');
const { rank } = require('../services/recommendationV1');
const { answer } = require('../services/groundedAssistant');
const {loadCreatorCohort}=require('../services/recommendationCohort');
const { uuid, validateSettings, validateEvidence, validateEvent } = require('../services/recommendationValidation');
const parse = x => typeof x === 'string' ? JSON.parse(x) : x;
const digest = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

function createRouter({ express, db, verifyToken, calibration = null, baseline }) {
  const router = express.Router();
  router.use(verifyToken);
  // Check live role, so a changed/revoked role is not trusted from an old JWT.
  router.use(async (req,res,next) => {
    try {
      const [users] = await db.query('SELECT role FROM users WHERE userId = ?', [req.user.userId]);
      if (!users.length || !['business','admin'].includes(users[0].role)) return res.status(403).json({error:'Forbidden'});
      req.liveRole = users[0].role; next();
    } catch { res.status(500).json({error:'Server error'}); }
  });
  router.put('/creator-evidence/:profileId', async (req,res) => {
    if (req.liveRole !== 'admin') return res.status(403).json({error:'Forbidden'});
    const id = Number(req.params.profileId);
    if (!Number.isInteger(id) || id <= 0 || !validateEvidence(req.body)) return res.status(400).json({error:'Invalid evidence'});
    try {
      const [profiles] = await db.query('SELECT profileId FROM creator_profiles WHERE profileId = ?', [id]);
      if (!profiles.length) return res.status(404).json({error:'Profile not found'});
      await db.query('INSERT INTO creator_recommendation_evidence (profileId,evidence,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE evidence=VALUES(evidence),updatedBy=VALUES(updatedBy)', [id,JSON.stringify(req.body),req.user.userId]);
      return res.json({profileId:id});
    } catch { return res.status(500).json({error:'Server error'}); }
  });
  router.put('/campaign-provenance/:campaignId', async (req,res) => {
    if (req.liveRole !== 'admin') return res.status(403).json({error:'Forbidden'});
    const id = Number(req.params.campaignId), b = req.body;
    if (!Number.isInteger(id) || id <= 0 || !b || Object.keys(b).some(k=>!['embeddingVersion','embeddingHash'].includes(k))
      || typeof b.embeddingVersion !== 'string' || !b.embeddingVersion.length || b.embeddingVersion.length>200
      || typeof b.embeddingHash !== 'string' || !/^[0-9a-f]{64}$/.test(b.embeddingHash)) return res.status(400).json({error:'Invalid provenance'});
    try {
      const [rows] = await db.query('SELECT campaignId FROM campaigns WHERE campaignId=?',[id]);
      if (!rows.length) return res.status(404).json({error:'Campaign not found'});
      await db.query('INSERT INTO campaign_embedding_provenance (campaignId,provenance,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE provenance=VALUES(provenance),updatedBy=VALUES(updatedBy)',[id,JSON.stringify(b),req.user.userId]);
      res.json({campaignId:id});
    } catch { res.status(500).json({error:'Server error'}); }
  });
  // Scope every campaign operation before fetching runs or profile evidence.
  router.use('/:campaignId', async (req,res,next) => {
    if (req.liveRole !== 'business') return res.status(403).json({error:'Forbidden'});
    const id = Number(req.params.campaignId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({error:'Invalid campaign id'});
    try {
      const [rows] = await db.query('SELECT c.* FROM campaigns c JOIN businesses b ON b.businessId=c.businessId WHERE c.campaignId=? AND b.userId=?', [id,req.user.userId]);
      if (!rows.length) return res.status(404).json({error:'Campaign not found'});
      const [settings] = await db.query('SELECT settings FROM campaign_recommendation_settings WHERE campaignId=?', [id]);
      req.campaign = {...rows[0], ...(settings.length ? parse(settings[0].settings) : {})};
      const [provenance] = await db.query('SELECT provenance FROM campaign_embedding_provenance WHERE campaignId=?',[id]);
      if (provenance.length) Object.assign(req.campaign,parse(provenance[0].provenance));
      next();
    } catch { res.status(500).json({error:'Server error'}); }
  });
  router.get('/:campaignId/settings', (req,res) => res.json({goalKey:req.campaign.goalKey || 'balanced',
    budgetMax:req.campaign.budgetMax ?? null, budgetCurrency:req.campaign.budgetCurrency ?? null,
    deliverableScope:req.campaign.deliverableScope ?? null, targetFollowers:req.campaign.targetFollowers ?? null}));
  router.put('/:campaignId/settings', async (req,res) => {
    if (!validateSettings(req.body)) return res.status(400).json({error:'Supply goalKey, budgetMax, budgetCurrency, deliverableScope, targetFollowers; use null for unknown values'});
    try {
      await db.query('INSERT INTO campaign_recommendation_settings (campaignId,settings) VALUES (?,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)', [req.campaign.campaignId,JSON.stringify(req.body)]);
      res.json(req.body);
    } catch { res.status(500).json({error:'Server error'}); }
  });
  router.post('/:campaignId/runs', async (req,res) => {
    try {
      const cohort = await loadCreatorCohort(db,req.campaign.campaignId);
      const rows = cohort.rows;
      const creators = rows.map(({evidence,...p})=>({...p,...(evidence ? parse(evidence) : {})}));
      const full = rank(req.campaign,creators,{calibration,limit:creators.length});
      const runId = crypto.randomUUID();
      const baselineRecommendations = baseline ? await baseline(req.campaign,rows) : [];
      const snapshot = {...full, runId, candidateScores:full.recommendations, recommendations:full.recommendations.slice(0,5),
        dataOrigin:cohort.simulated?'synthetic':'existing_profiles',
        campaignHash:digest(req.campaign), creatorInputsHash:digest(creators),
        calibrationHash:calibration ? digest(calibration) : null,
        baselineVersion:'legacy-50-50', baselineRecommendations,
        featureSchemaVersion:'bizi-features-v1', eventSchemaVersion:'bizi-events-v1', generatedAt:new Date().toISOString()};
      await db.query('INSERT INTO recommendation_runs_v1 (runId,campaignId,actorId,algorithmVersion,snapshot) VALUES (?,?,?,?,?)', [runId,req.campaign.campaignId,req.user.userId,snapshot.algorithmVersion,JSON.stringify(snapshot)]);
      const {candidateScores,baselineRecommendations:shadow,...response} = snapshot;
      return res.status(201).json(response);
    } catch { return res.status(500).json({error:'Recommendation generation failed'}); }
  });
  async function ownedRun(req, runId) {
    const [rows] = await db.query('SELECT snapshot FROM recommendation_runs_v1 WHERE runId=? AND campaignId=?', [runId,req.campaign.campaignId]);
    return rows.length ? parse(rows[0].snapshot) : null;
  }
  router.get('/:campaignId/runs/:runId', async (req,res) => {
    if (!uuid(req.params.runId)) return res.status(400).json({error:'Invalid run id'});
    try {
      const run = await ownedRun(req,req.params.runId);
      if (!run) return res.status(404).json({error:'Run not found'});
      const {candidateScores,baselineRecommendations,...response} = run;
      res.json(response);
    } catch { res.status(500).json({error:'Server error'}); }
  });
  router.post('/:campaignId/events', async (req,res) => {
    if (!validateEvent(req.body)) return res.status(400).json({error:'Invalid event'});
    const b = req.body;
    try {
      const run = await ownedRun(req,b.runId);
      const recommendation = run?.recommendations.find(r=>r.profileId === b.profileId);
      if (!recommendation) return res.status(404).json({error:'Recommendation not found in this run'});
      if (b.eventType !== 'impression') {
        const [impressions] = await db.query('SELECT eventId FROM recommendation_events_v1 WHERE eventId=? AND runId=? AND profileId=? AND actorId=? AND eventType=?', [b.impressionId,b.runId,b.profileId,req.user.userId,'impression']);
        if (!impressions.length) return res.status(400).json({error:'A matching visible-card impression is required'});
      }
      const payload = {schemaVersion:'bizi-events-v1',rank:recommendation.rank,algorithmVersion:run.algorithmVersion,
        goal:run.goal,policy:run.policy,selectionPropensity:null, source:b.eventType==='outcome'?'business_reported':'client_reported',
        observed:b.payload || {}};
      try {
        await db.query('INSERT INTO recommendation_events_v1 (eventId,runId,profileId,actorId,eventType,impressionId,payload) VALUES (?,?,?,?,?,?,?)', [b.eventId,b.runId,b.profileId,req.user.userId,b.eventType,b.impressionId || null,JSON.stringify(payload)]);
      } catch(e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e;
        const [existing] = await db.query('SELECT * FROM recommendation_events_v1 WHERE eventId=?', [b.eventId]);
        const old = existing[0];
        if (!old || old.runId!==b.runId || old.profileId!==b.profileId || old.actorId!==req.user.userId || old.eventType!==b.eventType
          || (old.impressionId || null)!==(b.impressionId || null) || JSON.stringify(parse(old.payload).observed)!==JSON.stringify(payload.observed)) return res.status(409).json({error:'Event id already used for different data'});
        return res.status(200).json({eventId:b.eventId,duplicate:true});
      }
      return res.status(201).json({eventId:b.eventId});
    } catch { return res.status(500).json({error:'Event could not be stored'}); }
  });
  router.post('/:campaignId/assistant', async (req,res) => {
    const {question,runId} = req.body || {};
    if (typeof question!=='string' || !question.trim() || question.length>2000 || (runId!==undefined && !uuid(runId))) return res.status(400).json({error:'Invalid question or runId'});
    try {
      const run = runId ? await ownedRun(req,runId) : null;
      if (runId && !run) return res.status(404).json({error:'Run not found'});
      res.json(answer(question,req.campaign,run));
    } catch { res.status(500).json({error:'Assistant unavailable'}); }
  });
  return router;
}
module.exports = {createRouter};
