'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeCreator}=require('../services/syntheticCreatorFactory');
const {seedTestData}=require('../scripts/seedTestData');
test('300 deterministic, distinct complete profiles preserve simulation provenance',()=>{
 const now=Date.parse('2026-10-19T12:00:00Z'),profiles=Array.from({length:300},(_,i)=>makeCreator(i,now));
 assert.equal(new Set(profiles.map(p=>p.handle)).size,300);
 assert.equal(new Set(profiles.map(p=>p.niche)).size,10);assert.equal(new Set(profiles.map(p=>p.platform)).size,3);assert.equal(new Set(profiles.map(p=>p.location)).size,5);
 for(const p of profiles){assert.ok(p.audienceDescription&&p.followers>0&&p.rate>0&&p.rate<=100&&p.vector.length===16&&p.evidence.priceAmount>0&&p.evidence.priceScope);assert.equal(p.evidence.priceVerified,false);assert.equal(p.evidence.dataOrigin,'synthetic');assert.ok(p.scenario.simulatedVerificationAt);}
 assert.deepEqual(makeCreator(42,now),profiles[42]);
});
test('synthetic test seeder requires a local password before touching the database',async()=>{
 const original=process.env.BIZI_TEST_SEED_PASSWORD;
 delete process.env.BIZI_TEST_SEED_PASSWORD;
 try { await assert.rejects(seedTestData(),/BIZI_TEST_SEED_PASSWORD/); }
 finally { if(original===undefined)delete process.env.BIZI_TEST_SEED_PASSWORD;else process.env.BIZI_TEST_SEED_PASSWORD=original; }
});
