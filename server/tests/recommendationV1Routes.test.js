'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require(process.env.BIZI_TEST_EXPRESS_PATH || 'express');
const {createRouter} = require('../routes/recommendationV1Routes');
async function fixture(t, overrides={}) {
  const runId = crypto.randomUUID();
  const run = {runId,algorithmVersion:'bizi-v1.0.0',goal:'balanced',policy:'deterministic_no_exploration',recommendations:[{profileId:1,rank:1,components:{},warnings:[],suitabilityScore:10,evidenceCoverage:20,priceStatus:'price_unverified'}]};
  const calls=[], events=new Map();
  const db={query:async (sql,args)=>{
    calls.push(sql);
    if (sql.startsWith('SELECT role')) return [[{role:overrides.role || 'business'}]];
    if (sql.startsWith('SELECT c.*')) return [overrides.owned===false ? [] : [{campaignId:1,businessId:1}]];
    if (sql.startsWith('SELECT settings') || sql.startsWith('SELECT provenance')) return [[]];
    if (sql.startsWith('SELECT snapshot')) return [args[0]===runId ? [{snapshot:JSON.stringify(run)}] : []];
    if (sql.startsWith('SELECT eventId')) return [[...events.values()].filter(e=>e.eventId===args[0] && e.eventType==='impression' && e.actorId===args[3] && e.runId===args[1] && e.profileId===args[2])];
    if (sql.startsWith('SELECT * FROM recommendation_events')) return [[events.get(args[0])].filter(Boolean)];
    if (sql.startsWith('INSERT INTO recommendation_events')) {
      if (events.has(args[0])) throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
      const [eventId,runId,profileId,actorId,eventType,impressionId,payload]=args;
      events.set(eventId,{eventId,runId,profileId,actorId,eventType,impressionId,payload}); return [{}];
    }
    throw new Error('Unexpected query: '+sql);
  }};
  const app=express(); app.use(express.json()); app.use('/v1',createRouter({express,db,verifyToken:(req,res,next)=>{req.user={userId:9,role:'business'};next();}}));
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=async (path,body)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/v1${path}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
    return {status:response.status,body:await response.json()};
  };
  return {runId,request,calls,events};
}
test('live creator role denied despite business JWT',async t=>{
  const f=await fixture(t,{role:'creator'}); assert.equal((await f.request('/1/runs/'+f.runId)).status,403);
  assert.equal(f.calls.length,1);
});
test('unowned campaign fails before run retrieval',async t=>{
  const f=await fixture(t,{owned:false}); assert.equal((await f.request('/1/runs/'+f.runId)).status,404);
  assert.ok(!f.calls.some(x=>x.startsWith('SELECT snapshot')));
});
test('other run and profile cannot log events',async t=>{
  const f=await fixture(t); const b={eventId:crypto.randomUUID(),runId:f.runId,profileId:2,eventType:'impression'};
  assert.equal((await f.request('/1/events',b)).status,404);
  assert.equal((await f.request('/1/assistant',{question:'creator',runId:crypto.randomUUID()})).status,404);
});
test('impression and click logging is idempotent, preserves rank and rejects mismatched duplicates',async t=>{
  const f=await fixture(t); const b={eventId:crypto.randomUUID(),runId:f.runId,profileId:1,eventType:'impression'};
  assert.equal((await f.request('/1/events',b)).status,201);
  assert.equal((await f.request('/1/events',b)).status,200);
  assert.equal(JSON.parse(f.events.get(b.eventId).payload).rank,1);
  const click={...b,eventId:crypto.randomUUID(),eventType:'click',impressionId:crypto.randomUUID()};
  assert.equal((await f.request('/1/events',click)).status,400);
  click.impressionId=b.eventId; assert.equal((await f.request('/1/events',click)).status,201);
  assert.equal((await f.request('/1/events',{...click,eventType:'shortlist'})).status,409);
});
