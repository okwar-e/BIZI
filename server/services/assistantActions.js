'use strict';
const crypto=require('node:crypto');
const {validateSettings}=require('./recommendationValidation');
const {rank}=require('./recommendationV1');
const {loadCreatorCohort,NAMESPACE}=require('./recommendationCohort');
const {hash}=require('./assistantRetrieval');
const decode=x=>typeof x==='string'?JSON.parse(x):x;
const error=(status,message)=>Object.assign(new Error(message),{status});
const string={type:'string',maxLength:255},optional={type:['string','null'],maxLength:2000};
const settingsSchema={type:'object',additionalProperties:false,properties:{goalKey:{type:'string',enum:['balanced','awareness','engagement','conversion']},budgetMax:{type:['number','null']},budgetCurrency:{type:['string','null']},deliverableScope:{type:['string','null']},targetFollowers:{type:['number','null']}},required:['goalKey','budgetMax','budgetCurrency','deliverableScope','targetFollowers']};
const definitions={
 create_campaign:{role:'business',description:'Propose creating a campaign. No change occurs until the user confirms the preview.',properties:{nicheText:string,targetAudience:optional,preferredPlatforms:{type:['string','null'],maxLength:255},location:{type:['string','null'],maxLength:255},campaignGoal:optional,settings:settingsSchema},required:['nicheText','settings']},
 update_campaign_settings:{role:'business',description:'Propose replacing ranking settings for an owned campaign.',properties:{campaignId:{type:'integer'},settings:settingsSchema},required:['campaignId','settings']},
 generate_recommendations:{role:'business',description:'Propose generating a new recommendation snapshot for an owned campaign.',properties:{campaignId:{type:'integer'}},required:['campaignId']},
 update_creator_profile:{role:'creator',description:'Propose updating your own creator profile. This does not verify metrics.',properties:{niche:string,audienceDescription:{type:'string',maxLength:2000},platforms:{type:'string',maxLength:255},location:{type:['string','null'],maxLength:255}},required:['niche','audienceDescription','platforms','location']},
 update_creator_metrics:{role:'creator',description:'Propose updating your own self-reported metrics only.',properties:{selfReportedEngagement:{type:'number',minimum:0,maximum:100},followerCount:{type:'integer',minimum:0,maximum:1e12}},required:['selfReportedEngagement','followerCount']},
};
function toolsFor(role){return Object.entries(definitions).filter(([,d])=>d.role===role).map(([name,d])=>({type:'function',function:{name,description:d.description,parameters:{type:'object',additionalProperties:false,properties:d.properties,required:d.required}}}));}
function validateAction(role,name,args) {
 const d=definitions[name];if(!d||d.role!==role)throw error(403,'Action is not available for this role');
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(d.properties,k))||d.required.some(k=>!Object.hasOwn(args,k)))throw error(400,'Invalid action fields');
 if('campaignId'in args&&(!Number.isInteger(args.campaignId)||args.campaignId<=0))throw error(400,'A valid campaignId is required');
 if('settings'in args&&!validateSettings(args.settings))throw error(400,'Supply a complete valid settings object');
 for(const [key,schema]of Object.entries(d.properties)){
  if(!Object.hasOwn(args,key)||key==='settings'||key==='campaignId')continue;
  const value=args[key],types=Array.isArray(schema.type)?schema.type:[schema.type];
  if(value===null){if(!types.includes('null'))throw error(400,`${key} cannot be null`);continue;}
  if(types.includes('string')){if(typeof value!=='string'||value.length>(schema.maxLength||2000)||(d.required.includes(key)&&!value.trim()))throw error(400,`Invalid ${key}`);}
  else if(types.includes('number')||types.includes('integer')){if(typeof value!=='number'||!Number.isFinite(value)||(types.includes('integer')&&!Number.isInteger(value))||value<(schema.minimum??0)||value>(schema.maximum??1e12))throw error(400,`Invalid ${key}`);}
 }
 return structuredClone(args);
}
async function target(db,actor,name,args,lock=false) {
 const suffix=lock?' FOR UPDATE':'';
 if(name==='create_campaign'){
  const [rows]=await db.query('SELECT businessId FROM businesses WHERE userId=? LIMIT 1'+suffix,[actor.userId]);if(!rows.length)throw error(404,'Business not found');return rows[0];
 }
 if(name==='update_campaign_settings'||name==='generate_recommendations'){
  const [rows]=await db.query('SELECT c.*,s.settings FROM campaigns c JOIN businesses b ON b.businessId=c.businessId LEFT JOIN campaign_recommendation_settings s ON s.campaignId=c.campaignId WHERE c.campaignId=? AND b.userId=?'+suffix,[args.campaignId,actor.userId]);
  if(!rows.length)throw error(404,'Campaign not found');return rows[0];
 }
 const [rows]=await db.query('SELECT c.creatorId AS creatorAccountId,p.* FROM creators c LEFT JOIN creator_profiles p ON p.creatorId=c.creatorId WHERE c.userId=? LIMIT 1'+suffix,[actor.userId]);
 if(!rows.length)throw error(404,'Creator not found');if(name==='update_creator_metrics'&&!rows[0].profileId)throw error(400,'Create your profile before adding metrics');return rows[0];
}
async function propose({db,actor,name,args}) {
 args=validateAction(actor.role,name,args);
 const resource=await target(db,actor,name,args),proposalId=crypto.randomUUID(),expiresAt=new Date(Date.now()+10*60000);
 const resourceHash=hash({role:actor.role,resource});
 await db.query('INSERT INTO assistant_proposals(proposalId,actorId,role,actionName,argumentsJson,resourceHash,expiresAt) VALUES (?,?,?,?,?,?,?)',[proposalId,actor.userId,actor.role,name,JSON.stringify(args),resourceHash,expiresAt]);
 await db.query('INSERT INTO assistant_audit(actorId,proposalId,eventType,metadata) VALUES (?,?,?,?)',[actor.userId,proposalId,'proposed',JSON.stringify({action:name})]);
 return {proposalId,action:name,arguments:args,expiresAt:expiresAt.toISOString(),requiresConfirmation:true,before:publicBefore(resource)};
}
function publicBefore(resource){const {nicheEmbedding,...safe}=resource;return safe;}
async function apply(db,actor,name,args,resource) {
 if(name==='create_campaign'){
  const [result]=await db.query('INSERT INTO campaigns(businessId,nicheText,targetAudience,preferredPlatforms,location,campaignGoal) VALUES (?,?,?,?,?,?)',[resource.businessId,args.nicheText,args.targetAudience||null,args.preferredPlatforms||null,args.location||null,args.campaignGoal||null]);
  const campaignId=result.insertId;
  await db.query('INSERT INTO campaign_recommendation_settings(campaignId,settings) VALUES (?,?)',[campaignId,JSON.stringify(args.settings)]);
  const [demo]=await db.query('SELECT namespace FROM demo_dataset_records WHERE namespace=? AND entityType=? AND entityId=?',[NAMESPACE,'business',String(resource.businessId)]);
  if(demo.length)await db.query('INSERT INTO demo_dataset_records(namespace,recordKey,entityType,entityId,provenance) VALUES (?,?,?,?,?)',[NAMESPACE,`assistant-campaign-${campaignId}`,'campaign',String(campaignId),JSON.stringify({dataOrigin:'synthetic',source:'assistant_confirmed'})]);
  return {campaignId,message:'Campaign created'};
 }
 if(name==='update_campaign_settings'){
  await db.query('INSERT INTO campaign_recommendation_settings(campaignId,settings) VALUES (?,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)',[args.campaignId,JSON.stringify(args.settings)]);
  return {campaignId:args.campaignId,message:'Ranking settings updated'};
 }
 if(name==='generate_recommendations'){
  const campaign={...resource,...(resource.settings?decode(resource.settings):{})};
  const [provenance]=await db.query('SELECT provenance FROM campaign_embedding_provenance WHERE campaignId=?',[args.campaignId]);
  if(provenance.length)Object.assign(campaign,decode(provenance[0].provenance));
  const calibration=require('./calibrationRegistry').loadCalibration();
  const cohort=await loadCreatorCohort(db,args.campaignId),full=rank(campaign,cohort.rows,{calibration,limit:cohort.rows.length});
  const runId=crypto.randomUUID();
  const baselineRecommendations=await require('./recommendationEngine').generateRecommendations(campaign,cohort.rows);
  const snapshot={...full,runId,candidateScores:full.recommendations,recommendations:full.recommendations.slice(0,5),featureSchemaVersion:'bizi-features-v1',eventSchemaVersion:'bizi-events-v1',generatedAt:new Date().toISOString(),dataOrigin:cohort.simulated?'synthetic':'existing_profiles',campaignHash:hash(campaign),creatorInputsHash:hash(cohort.rows),baselineVersion:'legacy-50-50',baselineRecommendations};
  await db.query('INSERT INTO recommendation_runs_v1(runId,campaignId,actorId,algorithmVersion,snapshot) VALUES (?,?,?,?,?)',[runId,args.campaignId,actor.userId,snapshot.algorithmVersion,JSON.stringify(snapshot)]);
  return {campaignId:args.campaignId,runId,recommendations:snapshot.recommendations,message:'Recommendation run generated'};
 }
 if(name==='update_creator_profile'){
  let profileId=resource.profileId;
  if(profileId)await db.query('UPDATE creator_profiles SET niche=?,audienceDescription=?,platforms=?,location=?,nicheEmbedding=NULL WHERE profileId=?',[args.niche,args.audienceDescription,args.platforms,args.location,profileId]);
  else {const [r]=await db.query('INSERT INTO creator_profiles(creatorId,niche,audienceDescription,platforms,location) VALUES (?,?,?,?,?)',[resource.creatorAccountId,args.niche,args.audienceDescription,args.platforms,args.location]);profileId=r.insertId;}
  return {profileId,message:'Creator profile updated; embeddings will require fresh provenance'};
 }
 await db.query('UPDATE creator_profiles SET selfReportedEngagement=?,followerCount=? WHERE profileId=?',[args.selfReportedEngagement,args.followerCount,resource.profileId]);
 return {profileId:resource.profileId,message:'Self-reported metrics updated'};
}
async function confirm({db,actor,proposalId}) {
 const connection=await db.getConnection();
 try {
  await connection.beginTransaction();
  const [users]=await connection.query('SELECT role FROM users WHERE userId=? FOR UPDATE',[actor.userId]);
  if(!users.length||users[0].role!==actor.role)throw error(403,'Role changed; sign in again');
  const [proposals]=await connection.query('SELECT * FROM assistant_proposals WHERE proposalId=? AND actorId=? FOR UPDATE',[proposalId,actor.userId]);
  const p=proposals[0];if(!p)throw error(404,'Proposal not found');
  if(p.role!==actor.role)throw error(403,'Proposal role does not match');
  if(p.status==='confirmed'){await connection.commit();return {...decode(p.resultJson),duplicate:true};}
  if(p.status!=='pending')throw error(409,'Proposal is no longer pending');
  if(new Date(p.expiresAt).getTime()<=Date.now())throw error(409,'Proposal expired; request a new preview');
  const args=validateAction(actor.role,p.actionName,decode(p.argumentsJson));
  const resource=await target(connection,actor,p.actionName,args,true);
  if(hash({role:actor.role,resource})!==p.resourceHash)throw error(409,'The resource changed; request a fresh preview');
  const result=await apply(connection,actor,p.actionName,args,resource);
  await connection.query('UPDATE assistant_proposals SET status=?,resultJson=? WHERE proposalId=?',['confirmed',JSON.stringify(result),proposalId]);
  await connection.query('INSERT INTO assistant_audit(actorId,proposalId,eventType,metadata) VALUES (?,?,?,?)',[actor.userId,proposalId,'confirmed',JSON.stringify({action:p.actionName,result})]);
  await connection.commit();return result;
 }catch(e){await connection.rollback();await db.query('INSERT INTO assistant_audit(actorId,proposalId,eventType,metadata) VALUES (?,?,?,?)',[actor.userId,proposalId,'confirmation_failed',JSON.stringify({status:e.status||500})]).catch(()=>{});throw e;}
 finally{connection.release();}
}
module.exports={definitions,toolsFor,validateAction,propose,confirm,target};
