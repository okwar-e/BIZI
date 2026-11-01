'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const db=require('../config/db'),bcrypt=require('bcrypt');
const {NAMESPACE}=require('../services/recommendationCohort');
const {makeCreator,categories,platforms,locations,scopes,seed,digest}=require('../services/syntheticCreatorFactory');
async function run() {
 let connection;
 try {
  const output=process.env.BIZI_DEMO_OUTPUT || path.join(__dirname,'../data/complete-demo');fs.mkdirSync(output,{recursive:true});
  const loginFile=path.join(output,'local-login.json');
  // Persist generated local-only credentials before DB work so an interrupted rerun stays recoverable.
  let login=fs.existsSync(loginFile)?JSON.parse(fs.readFileSync(loginFile,'utf8')):null;
  if(!login){login={email:'complete300.demo@synthetic.test',password:`LocalDemo-${crypto.randomBytes(15).toString('base64url')}!`,warning:'LOCAL SYNTHETIC DEMO ONLY'};fs.writeFileSync(loginFile,JSON.stringify(login,null,2),{mode:0o600});}
  const profiles=Array.from({length:300},(_,i)=>makeCreator(i,Date.now()));
  connection=await db.getConnection();await connection.beginTransaction();
  const find=async key=>{const [r]=await connection.query('SELECT entityId FROM demo_dataset_records WHERE namespace=? AND recordKey=?',[NAMESPACE,key]);return r[0]?.entityId;};
  const tag=async(key,type,id,provenance)=>connection.query('INSERT INTO demo_dataset_records(namespace,recordKey,entityType,entityId,provenance) VALUES (?,?,?,?,?)',[NAMESPACE,key,type,String(id),JSON.stringify({dataOrigin:'synthetic',seed,...provenance})]);
  let businessId=Number(await find('business')),actorId;
  if(!businessId){const [u]=await connection.query('INSERT INTO users(name,email,passwordHash,role) VALUES (?,?,?,?)',['Complete 300 Demo',login.email,await bcrypt.hash(login.password,10),'business']);actorId=u.insertId;const [b]=await connection.query('INSERT INTO businesses(userId,businessName,industry) VALUES (?,?,?)',[actorId,'SYNTHETIC — 300 Creator Lab','Simulation']);businessId=b.insertId;await tag('business','business',businessId,{actorId});}
  else {const [b]=await connection.query('SELECT userId FROM businesses WHERE businessId=?',[businessId]);actorId=b[0].userId;}
  const creatorPasswordHash=await bcrypt.hash(crypto.randomBytes(24).toString('hex'),10);
  for(const p of profiles){
    let profileId=Number(await find(p.key));
    if(!profileId){
      const [u]=await connection.query('INSERT INTO users(name,email,passwordHash,role) VALUES (?,?,?,?)',[p.name,`${p.key}@complete300.synthetic.test`,creatorPasswordHash,'creator']);
      const [c]=await connection.query('INSERT INTO creators(userId,publicHandle,verificationStatus) VALUES (?,?,?)',[u.insertId,p.handle,'unverified']);
      const [cp]=await connection.query('INSERT INTO creator_profiles(creatorId,niche,audienceDescription,nicheEmbedding,platforms,location,selfReportedEngagement,verifiedEngagement,followerCount,verificationDiscrepancyFlag,lastVerifiedAt) VALUES (?,?,?,?,?,?,?,NULL,?,FALSE,NULL)',[c.insertId,p.niche,p.audienceDescription,JSON.stringify(p.vector),p.platform,p.location,p.rate,p.followers]);profileId=cp.insertId;
      await connection.query('INSERT INTO creator_recommendation_evidence(profileId,evidence,updatedBy) VALUES (?,?,?)',[profileId,JSON.stringify(p.evidence),actorId]);
      await tag(p.key,'profile',profileId,{creatorId:c.insertId,userId:u.insertId,scenario:p.scenario,allMeasurementsSimulated:true});
    }
    p.profileId=profileId;
    const [saved]=await connection.query('SELECT cp.*,e.evidence,r.provenance FROM creator_profiles cp JOIN creator_recommendation_evidence e ON e.profileId=cp.profileId JOIN demo_dataset_records r ON CAST(r.entityId AS UNSIGNED)=cp.profileId AND r.namespace=? AND r.recordKey=? WHERE cp.profileId=?',[NAMESPACE,p.key,profileId]);
    const read=x=>typeof x==='string'?JSON.parse(x):x,stored=saved[0];
    Object.assign(p,{niche:stored.niche,audienceDescription:stored.audienceDescription,platform:stored.platforms,location:stored.location,followers:stored.followerCount,rate:stored.selfReportedEngagement,vector:read(stored.nicheEmbedding),evidence:read(stored.evidence),scenario:read(stored.provenance).scenario});
  }
  const campaigns=[];
  for(let i=0;i<12;i++){
    const goal=['awareness','engagement','conversion','balanced'][i%4],platform=platforms[i%3],niche=categories[i%10],key=`campaign-${i+1}`;
    let id=Number(await find(key));
    if(!id){const vector=Array.from({length:16},(_,k)=>k===i%10?1:k===10+i%3?.25:0);const [c]=await connection.query('INSERT INTO campaigns(businessId,nicheText,targetAudience,preferredPlatforms,location,campaignGoal,nicheEmbedding) VALUES (?,?,?,?,?,?,?)',[businessId,niche,`SYNTHETIC test audience interested in ${niche}`,platform,locations[i%5],`SYNTHETIC ${goal} campaign`,JSON.stringify(vector)]);id=c.insertId;await connection.query('INSERT INTO campaign_recommendation_settings(campaignId,settings) VALUES (?,?)',[id,JSON.stringify({goalKey:goal,budgetMax:50000,budgetCurrency:'KES',deliverableScope:scopes[platform],targetFollowers:50000})]);await connection.query('INSERT INTO campaign_embedding_provenance(campaignId,provenance,updatedBy) VALUES (?,?,?)',[id,JSON.stringify({dataOrigin:'synthetic',embeddingVersion:'synthetic-latent-16-v1',embeddingHash:digest(vector)}),actorId]);await tag(key,'campaign',id,{goal,syntheticPool:NAMESPACE});}
    campaigns.push({campaignId:id,goal,platform,niche});
  }
  await connection.commit();connection.release();connection=null;
  const manifest={namespace:NAMESPACE,generatorVersion:seed,creatorCount:300,profiles,campaigns,notes:['All identities, demographics, metrics, quotes and latent vectors are synthetic.','Real verification fields intentionally remain null/false; simulated verification state lives only in scenario provenance.','No fabricated calibration distribution or business outcomes.']};
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({creators:profiles.length,campaigns:campaigns.length,namespace:NAMESPACE,output,realVerificationClaimed:false}));
 }catch(e){if(connection){await connection.rollback();connection.release();}console.error(e.code||e.message);process.exitCode=1;}finally{await db.end();}
}
if(require.main===module)run();
module.exports={makeCreator};
