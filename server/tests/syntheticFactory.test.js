'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeCreator}=require('../services/syntheticCreatorFactory');
const {rank}=require('../services/recommendationV1');
test('300 deterministic, distinct complete profiles preserve simulation provenance',()=>{
 const now=Date.parse('2026-10-19T12:00:00Z'),profiles=Array.from({length:300},(_,i)=>makeCreator(i,now));
 assert.equal(new Set(profiles.map(p=>p.handle)).size,300);
 assert.equal(new Set(profiles.map(p=>p.niche)).size,10);assert.equal(new Set(profiles.map(p=>p.platform)).size,3);assert.equal(new Set(profiles.map(p=>p.location)).size,5);
 for(const p of profiles){assert.ok(p.audienceDescription&&p.followers>0&&p.rate>0&&p.rate<=100&&p.vector.length===16&&p.evidence.priceAmount>0&&p.evidence.priceScope);assert.equal(p.evidence.priceVerified,false);assert.equal(p.evidence.dataOrigin,'synthetic');assert.ok(p.scenario.simulatedVerificationAt);}
 assert.deepEqual(makeCreator(42,now),profiles[42]);
});
test('complete simulated inputs reach 100% completeness without masquerading as verified evidence',()=>{
 const now=Date.parse('2026-10-19T12:00:00Z'),p=makeCreator(0,now);
 const creator={...p.evidence,profileId:1,niche:p.niche,audienceDescription:p.audienceDescription,platforms:p.platform,location:p.location,followerCount:p.followers,selfReportedEngagement:p.rate,nicheEmbedding:JSON.stringify(p.vector)};
 const campaign={nicheText:p.niche,preferredPlatforms:p.platform,location:p.location,goalKey:'balanced',budgetMax:50000,budgetCurrency:'KES',deliverableScope:p.evidence.priceScope,targetFollowers:50000};
 const result=rank(campaign,[creator],{now}).recommendations[0];assert.equal(result.fieldCompleteness,100);assert.equal(result.priceStatus,'price_unverified');assert.ok(result.evidenceCoverage<100);assert.equal(result.components.engagement.score,0);assert.equal(result.dataOrigin,'synthetic');
});
