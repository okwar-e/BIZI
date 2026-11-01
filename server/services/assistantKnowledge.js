'use strict';
const methodology=require('./recommendationMethodology');
const {WEIGHTS}=require('./recommendationV1');
const help=[
  {id:'help:registration',title:'Accounts and registration',text:'Create an account, choose Business or Creator, fill in the matching form, then sign in. Business: name, email, password, business name, optional industry. Creator: name, email, password and public handle. Password confirmation is checked before submission. Duplicate email means sign in or choose another email.'},
  {id:'help:business',title:'Business workflow',text:'Businesses create campaigns with a niche brief, audience, platforms and optional creator location. Save explicit ranking goal, numeric budget, currency, deliverable scope and follower target. Generate recommendations after saving. Historical runs remain snapshots.'},
  {id:'help:creator',title:'Creator workflow',text:'Creators can ask the assistant to propose an update to their own niche, audience description, platforms and location, and self-reported engagement percentage and follower count. Self-reported metrics are not verified metrics. Profile and metrics changes require a preview and explicit confirmation.'},
  {id:'help:actions',title:'Assistant actions',text:'The assistant can propose create_campaign, update_campaign_settings, generate_recommendations, update_creator_profile, and update_creator_metrics. Review the preview and confirm before execution. Proposals expire after ten minutes and stale resources require a new preview. The assistant cannot send messages, spend money, make bookings, delete accounts, change roles, or assert verification.'},
  {id:'help:simulation',title:'Synthetic creator lab',text:'The complete-300 demo business uses a dedicated pool of 300 simulated creators. All identities, metrics, audience descriptions, quotes and latent vectors are synthetic. Real verification fields remain unset. A record can be 100% populated yet have limited evidence coverage. Demo campaigns, creators, runs and events must be excluded from real training and calibration.'},
  {id:'help:learning',title:'Future learning and outcomes',text:'No trained outcome model or ROI prediction is served. Recommendation generation is not an impression. Actual visible-card impressions and interactions are logged separately, with algorithm, goal and position. Do not treat missing outcomes as failures. Deterministic exposure has no invented randomized propensity.'},
  {id:'method:formula',title:'Suitability and coverage',text:methodology.formula+' Goal weights: '+JSON.stringify(WEIGHTS)+'. '+methodology.tieBreak},
  ...methodology.components.map(c=>({id:`method:${c.id}`,title:`${c.id} scoring`,text:c.text})),
  {id:'method:constraints',title:'Exclusions and uncertainty',text:methodology.exclusions.join('; ')+'. Missing platform/location stays eligible with warnings. '+methodology.limitations.join(' ')},
];
const decode=x=>typeof x==='string'?JSON.parse(x):x;
async function loadKnowledge(db,actor,context={}) {
  const docs=[...help];
  if(actor.role==='business') {
    const [campaigns]=await db.query('SELECT c.*,s.settings FROM campaigns c JOIN businesses b ON b.businessId=c.businessId LEFT JOIN campaign_recommendation_settings s ON s.campaignId=c.campaignId WHERE b.userId=? ORDER BY c.campaignId DESC LIMIT 30',[actor.userId]);
    if(context.campaignId&&!campaigns.some(c=>c.campaignId===context.campaignId)) {
      const [owned]=await db.query('SELECT c.*,s.settings FROM campaigns c JOIN businesses b ON b.businessId=c.businessId LEFT JOIN campaign_recommendation_settings s ON s.campaignId=c.campaignId WHERE b.userId=? AND c.campaignId=?',[actor.userId,context.campaignId]);
      if(!owned.length)throw Object.assign(new Error('Campaign not found'),{status:404});campaigns.unshift(owned[0]);
    }
    const selected=context.campaignId?campaigns.filter(c=>c.campaignId===context.campaignId):campaigns;
    for(const c of selected)docs.push({id:`campaign:${c.campaignId}`,title:`Campaign ${c.campaignId}`,text:JSON.stringify({campaignId:c.campaignId,niche:c.nicheText,targetAudience:c.targetAudience,platforms:c.preferredPlatforms,location:c.location,objective:c.campaignGoal,settings:c.settings?decode(c.settings):{goalKey:'balanced'}}).slice(0,3500)});
    if(context.runId) {
      const [runs]=await db.query('SELECT r.campaignId,r.snapshot FROM recommendation_runs_v1 r JOIN campaigns c ON c.campaignId=r.campaignId JOIN businesses b ON b.businessId=c.businessId WHERE r.runId=? AND b.userId=?',[context.runId,actor.userId]);
      if(!runs.length||(context.campaignId&&runs[0].campaignId!==context.campaignId))throw Object.assign(new Error('Run not found'),{status:404});
      const run=decode(runs[0].snapshot);
      for(const r of run.recommendations||[])docs.push({id:`run:${context.runId}:profile:${r.profileId}`,title:`Recommendation ${r.profileId}`,text:JSON.stringify({runId:context.runId,generatedAt:run.generatedAt,goal:run.goal,...r}).slice(0,3500)});
    }
  } else if(actor.role==='creator') {
    const [profiles]=await db.query('SELECT c.creatorId,c.publicHandle,p.* FROM creators c LEFT JOIN creator_profiles p ON p.creatorId=c.creatorId WHERE c.userId=? LIMIT 1',[actor.userId]);
    if(profiles.length) {const p=profiles[0];docs.push({id:'creator:self',title:'Your creator profile',text:JSON.stringify({publicHandle:p.publicHandle,niche:p.niche,audienceDescription:p.audienceDescription,platforms:p.platforms,location:p.location,selfReportedEngagement:p.selfReportedEngagement,followerCount:p.followerCount,profileExists:!!p.profileId}).slice(0,3500)});}
  }
  return docs;
}
module.exports={help,loadKnowledge};
