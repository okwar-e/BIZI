'use strict';
const methodology=require('./recommendationMethodology');
const help=[
  {id:'help:registration',title:'Accounts and registration',text:'Create an account, choose Business or Creator, fill in the matching form, then sign in. Business: name, email, password, business name, optional industry. Creator: name, email, password and public handle. Password confirmation is checked before submission. Duplicate email means sign in or choose another email.'},
  {id:'help:business',title:'Business workflow',text:'Businesses create a campaign, set a total budget and creator target, publish it, then request ML creator recommendations while it is open. The suggested creator offer is a budget-derived starting point, not a market rate. Offers and creator invitations are managed in the campaign workspace.'},
  {id:'help:creator',title:'Creator workflow',text:'Creators can ask the assistant to propose an update to their own niche, audience description, platforms and location, and self-reported engagement percentage and follower count. Self-reported metrics are not verified metrics. Profile and metrics changes require a preview and explicit confirmation.'},
  {id:'help:actions',title:'Assistant actions',text:'The assistant can propose creator-profile updates and self-reported metric updates. Campaign creation and trained ML recommendations use the campaign workspace. Review each assistant preview and confirm before execution. Proposals expire after ten minutes and stale resources require a new preview. The assistant cannot send messages, spend money, make bookings, delete accounts, change roles, or assert verification.'},
  {id:'help:simulation',title:'Synthetic creator lab',text:'The complete-300 demo business uses a dedicated pool of 300 simulated creators. All identities, metrics, audience descriptions, quotes and latent vectors are synthetic. Real verification fields remain unset. A record can be 100% populated yet have limited evidence coverage. Demo campaigns, creators, runs and events must be excluded from real training and calibration.'},
  {id:'help:learning',title:'Recommendation limitations',text:methodology.limitations.join(' ')},
  {id:'method:formula',title:'Trained ML recommendation model',text:methodology.formula+' Model: '+methodology.modelType+'.'},
  ...methodology.features.map(feature=>({id:`method:${feature.id}`,title:feature.id,text:feature.text})),
  {id:'method:limitations',title:'Model limitations',text:methodology.limitations.join(' ')},
];
async function loadKnowledge(db,actor,context={}) {
  const docs=[...help];
  if(actor.role==='business') {
    const [campaigns]=await db.query('SELECT c.* FROM campaigns c JOIN businesses b ON b.businessId=c.businessId WHERE b.userId=? ORDER BY c.campaignId DESC LIMIT 30',[actor.userId]);
    if(context.campaignId&&!campaigns.some(c=>c.campaignId===context.campaignId)) {
      const [owned]=await db.query('SELECT c.* FROM campaigns c JOIN businesses b ON b.businessId=c.businessId WHERE b.userId=? AND c.campaignId=?',[actor.userId,context.campaignId]);
      if(!owned.length)throw Object.assign(new Error('Campaign not found'),{status:404});campaigns.unshift(owned[0]);
    }
    const selected=context.campaignId?campaigns.filter(c=>c.campaignId===context.campaignId):campaigns;
    for(const c of selected)docs.push({id:`campaign:${c.campaignId}`,title:`Campaign ${c.campaignId}`,text:JSON.stringify({campaignId:c.campaignId,niche:c.nicheText,targetAudience:c.targetAudience,platforms:c.preferredPlatforms,location:c.location,objective:c.campaignGoal,totalBudget:c.totalBudget,currency:c.currency,targetCreatorCount:c.targetCreatorCount,publicationStatus:c.publicationStatus}).slice(0,3500)});
  } else if(actor.role==='creator') {
    const [profiles]=await db.query('SELECT c.creatorId,c.publicHandle,p.* FROM creators c LEFT JOIN creator_profiles p ON p.creatorId=c.creatorId WHERE c.userId=? LIMIT 1',[actor.userId]);
    if(profiles.length) {const p=profiles[0];docs.push({id:'creator:self',title:'Your creator profile',text:JSON.stringify({publicHandle:p.publicHandle,niche:p.niche,audienceDescription:p.audienceDescription,platforms:p.platforms,location:p.location,selfReportedEngagement:p.selfReportedEngagement,followerCount:p.followerCount,profileExists:!!p.profileId}).slice(0,3500)});}
  }
  return docs;
}
module.exports={help,loadKnowledge};
