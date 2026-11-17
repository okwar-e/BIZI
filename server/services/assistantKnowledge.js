'use strict';
const {sanitizeContactDetails}=require('./creatorBio');
const recommendationGuidance='For the campaign creator suggestions, Bizi compares the business name, industry or content category, and promotion description with creator profile text. It also considers available catalogue statistics, such as follower count, following count and number of posts. The target audience, preferred platforms, location and budget are useful campaign details but are not inputs to this recommendation ranking. A match score is a ranking guide, not a percentage or a promise of performance, sales, reach or return on investment. Catalogue profiles may not be linked to registered Bizi accounts; to invite a registered creator, use Applications and invitations in the campaign workspace.';
const safeText=value=>typeof value==='string'?sanitizeContactDetails(value):value;
const help=[
  {id:'help:registration',title:'Accounts and registration',text:'Create an account, choose Business or Creator, fill in the matching form, then sign in. Business: name, email, password, business name, optional industry. Creator: name, email, password and public handle. Password confirmation is checked before submission. Duplicate email means sign in or choose another email.'},
  {id:'help:business',title:'Business workflow',text:'Businesses create a promotion (campaign), set a total budget and creator target, then open it so Bizi creators can see it and apply. Opening the promotion also enables creator suggestions. Review suggestions in the campaign workspace. Catalogue suggestions are not linked to registered Bizi accounts; invitations to registered creators are managed separately in Applications and invitations. The suggested creator offer is a budget-derived starting point, not a market rate.'},
  {id:'help:recommendations',title:'Creator suggestions and match scores',text:recommendationGuidance},
  {id:'help:creator',title:'Creator workflow',text:'Creators can ask the assistant to propose an update to their own niche, audience description, platforms and location, and self-reported engagement percentage and follower count. Self-reported metrics are not verified metrics. Profile and metrics changes require a preview and explicit confirmation.'},
  {id:'help:actions',title:'Assistant actions',text:'The assistant can propose creator-profile updates and self-reported metric updates. Campaign creation and trained ML recommendations use the campaign workspace. Review each assistant preview and confirm before execution. Proposals expire after ten minutes and stale resources require a new preview. The assistant cannot send messages, spend money, make bookings, delete accounts, change roles, or assert verification.'},
  {id:'help:simulation',title:'Synthetic creator lab',text:'The complete-300 demo business uses a dedicated pool of 300 simulated creators. All identities, metrics, audience descriptions, quotes and latent vectors are synthetic. Real verification fields remain unset. A record can be 100% populated yet have limited evidence coverage. Demo campaigns, creators, runs and events must be excluded from real training and calibration.'},
  {id:'help:learning',title:'Recommendation limitations',text:recommendationGuidance},
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
    for(const c of selected)docs.push({id:`campaign:${c.campaignId}`,title:`Promotion ${c.campaignId}`,text:JSON.stringify({campaignId:c.campaignId,niche:safeText(c.nicheText),targetAudience:safeText(c.targetAudience),platforms:safeText(c.preferredPlatforms),location:safeText(c.location),objective:safeText(c.campaignGoal),totalBudget:c.totalBudget,currency:c.currency,targetCreatorCount:c.targetCreatorCount,publicationStatus:c.publicationStatus}).slice(0,3500)});
  } else if(actor.role==='creator') {
    const [profiles]=await db.query('SELECT c.creatorId,c.publicHandle,p.* FROM creators c LEFT JOIN creator_profiles p ON p.creatorId=c.creatorId WHERE c.userId=? LIMIT 1',[actor.userId]);
    if(profiles.length) {const p=profiles[0];docs.push({id:'creator:self',title:'Your creator profile',text:JSON.stringify({publicHandle:safeText(p.publicHandle),niche:safeText(p.niche),audienceDescription:safeText(p.audienceDescription),platforms:safeText(p.platforms),location:safeText(p.location),selfReportedEngagement:p.selfReportedEngagement,followerCount:p.followerCount,profileExists:!!p.profileId}).slice(0,3500)});}
  }
  return docs;
}
module.exports={help,loadKnowledge};
