'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOpenRouter}=require('../services/openRouterService');
const {toolsFor,validateAction,propose,confirm}=require('../services/assistantActions');
const {lexical,cosine,hash,retrieve}=require('../services/assistantRetrieval');
const {validateCitations,normalizeCitations,redact,chat}=require('../services/biziAssistant');
const {loadKnowledge}=require('../services/assistantKnowledge');
const {loadCreatorCohort}=require('../services/recommendationCohort');
const actor={userId:7,role:'business'},settings={goalKey:'balanced',budgetMax:null,budgetCurrency:null,deliverableScope:null,targetFollowers:null};
test('tools and arguments cannot cross roles or introduce execution/verification fields',()=>{
 assert.equal(toolsFor('business').length,3);assert.equal(toolsFor('creator').length,2);assert.equal(toolsFor('admin').length,0);
 assert.throws(()=>validateAction('creator','create_campaign',{nicheText:'fitness',settings}),{status:403});
 assert.throws(()=>validateAction('creator','update_creator_metrics',{selfReportedEngagement:4,followerCount:5,verifiedEngagement:10}),{status:400});
 assert.throws(()=>validateAction('business','generate_recommendations',{campaignId:1,userId:9}),{status:400});
 assert.throws(()=>validateAction('business','shell',{command:'anything'}),{status:403});
 assert.throws(()=>validateAction('creator','update_creator_metrics',{selfReportedEngagement:101,followerCount:5}),{status:400});
 assert.deepEqual(validateAction('business','create_campaign',{nicheText:'fitness',settings}),{nicheText:'fitness',settings});
});
test('provider is disabled without configuration and never sends an incomplete request',async()=>{
 let count=0;const p=createOpenRouter({env:{},fetchImpl:async()=>{count++;}});assert.equal(p.status().chatConfigured,false);await assert.rejects(p.chat([]));assert.equal(count,0);
});
test('provider uses fixed endpoint, bounded generation and tool schema; rejects malformed vectors',async()=>{
 const calls=[];const p=createOpenRouter({env:{OPENROUTER_API_KEY:'test-only-fake',OPENROUTER_CHAT_MODEL:'fixture/chat',OPENROUTER_EMBEDDING_MODEL:'fixture/embed'},fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.endsWith('/embeddings')?{data:[{index:0,embedding:['bad']}]}:{choices:[{message:{content:'[help:registration] evidence'}}]}};}});
 await p.chat([{role:'user',content:'test'}],toolsFor('business'));assert.equal(calls[0].url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(calls[0].body.max_tokens,900);assert.equal(calls[0].body.parallel_tool_calls,false);await assert.rejects(p.embed(['test']));
});
test('retrieval ranks evidence and preserves honest lexical fallback',async()=>{
 const docs=[{id:'a',title:'Budget',text:'price budget quote'},{id:'b',title:'Profile',text:'creator niche'}];assert.equal(lexical('budget price',docs)[0].id,'a');assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([0],[0]),0);
 const result=await retrieve({db:{query:async()=>{throw new Error('unavailable')}},provider:{status:()=>({embeddingsConfigured:true,embeddingModel:'fixture'})},actorId:7,question:'budget',docs});assert.equal(result.mode,'lexical_embedding_unavailable');assert.equal(result.sources[0].id,'a');
});
test('generated citations must belong to retrieved sources; credential strings are redacted',()=>{
 const sources=[{id:'help:registration'}];assert.ok(validateCitations('Register here [help:registration]',sources));assert.ok(!validateCitations('Claim [other:user]',sources));assert.ok(!validateCitations('Uncited claim',sources));assert.ok(!validateCitations('Expected ROI 50% [help:registration]',sources));assert.ok(!redact('sk-or-v1-testfake123 Bearer test.token').includes('testfake123'));
});
test('citation normalization accepts only known source ids, never an invented source',()=>{
 const sources=[{id:'method:formula'}];assert.equal(normalizeCitations('Evidence [sourceId:method:formula]',sources),'Evidence [method:formula]');assert.equal(normalizeCitations('Claim [sourceId:private:other]',sources),'Claim [sourceId:private:other]');assert.ok(!validateCitations(normalizeCitations('Claim [sourceId:private:other]',sources),sources));
});
test('assistant falls back on uncited generation and cannot turn an unknown model tool into a write',async()=>{
 const writes=[],db={query:async(sql)=>{if(sql.startsWith('INSERT'))writes.push(sql);return [[]];}};
 const actor={userId:7,role:'creator'};
 let provider={status:()=>({chatConfigured:true,embeddingsConfigured:false}),chat:async()=>({content:'An unsupported claim',toolCalls:[]})};
 const fallback=await chat({db,provider,actor,question:'Explain engagement scoring'});assert.equal(fallback.mode,'grounded_extracts');assert.ok(fallback.citations.length);
 provider={...provider,chat:async()=>({content:'',toolCalls:[{type:'function',function:{name:'delete_account',arguments:'{}'}}]})};
 const denied=await chat({db,provider,actor,question:'Delete an account'});assert.equal(denied.proposal,null);assert.equal(writes.length,0);
});
test('embedding cache lookups are scoped to actor and embedding model',async()=>{
 const scopes=[],provider={status:()=>({embeddingsConfigured:true,embeddingModel:'fixture/model'}),embed:async texts=>texts.map(()=>[1,0])};
 const db={query:async(sql,args)=>{if(sql.startsWith('SELECT')){scopes.push(args);return [[]];}return [{}];}};
 const result=await retrieve({db,provider,actorId:123,question:'budget',docs:[{id:'a',title:'Budget',text:'budget evidence'}]});assert.equal(result.mode,'hybrid');assert.ok(scopes.length);for(const [,actor,model]of scopes){assert.equal(actor,123);assert.equal(model,'fixture/model');}
});
test('creator retrieval cannot query other creator or business data',async()=>{
 const queries=[];const db={query:async(sql,args)=>{queries.push({sql,args});return [[{creatorId:1,publicHandle:'mine',profileId:2,niche:'fitness'}]];}};const docs=await loadKnowledge(db,{userId:7,role:'creator'});assert.ok(docs.some(d=>d.id==='creator:self'));assert.equal(queries.length,1);assert.deepEqual(queries[0].args,[7]);assert.ok(!queries[0].sql.includes('campaigns'));
});
test('business retrieval fails closed on an unowned campaign or run',async()=>{
 const db={query:async()=>[[]]};await assert.rejects(loadKnowledge(db,actor,{campaignId:9}),{status:404});await assert.rejects(loadKnowledge(db,actor,{runId:'other'}),{status:404});
});
test('cohort scope includes 300 only for tagged campaigns and excludes them otherwise',async()=>{
 for(const simulated of [true,false]){const queries=[];const db={query:async(sql)=>{queries.push(sql);return sql.startsWith('SELECT namespace')?[simulated?[{namespace:'bizi-complete-300-v1'}]:[]]:[[]];}};assert.equal((await loadCreatorCohort(db,1)).simulated,simulated);assert.ok(queries[2].includes(simulated?'profileId IN':'profileId NOT IN'));}
});
test('unowned action cannot create a proposal',async()=>{
 let writes=0;const db={query:async(sql)=>{if(sql.startsWith('INSERT'))writes++;return [[]];}};await assert.rejects(propose({db,actor,name:'update_campaign_settings',args:{campaignId:44,settings}}),{status:404});assert.equal(writes,0);
});
function confirmationFixture({status='pending',expired=false,stale=false,role='business',owned=true}={}){
 const operations=[],resource={campaignId:3,businessId:1,settings:null};
 const proposal={proposalId:'id',actorId:7,role:'business',actionName:'update_campaign_settings',argumentsJson:JSON.stringify({campaignId:3,settings}),resourceHash:stale?'bad':hash({role:'business',resource}),status,expiresAt:new Date(Date.now()+(expired?-10000:600000)),resultJson:JSON.stringify({campaignId:3,message:'already done'})};
 const connection={beginTransaction:async()=>operations.push('begin'),commit:async()=>operations.push('commit'),rollback:async()=>operations.push('rollback'),release:()=>operations.push('release'),query:async(sql,args)=>{operations.push(sql);if(sql.startsWith('SELECT role'))return [[{role}]];if(sql.startsWith('SELECT * FROM assistant_proposals'))return [owned?[proposal]:[]];if(sql.startsWith('SELECT c.*'))return [[resource]];return [{affectedRows:1}];}};
 return {operations,db:{getConnection:async()=>connection,query:async()=>[{}]}};
}
test('confirmation is atomic and repeat confirmations do not write twice',async()=>{
 let f=confirmationFixture();const result=await confirm({db:f.db,actor,proposalId:'id'});assert.equal(result.campaignId,3);assert.ok(f.operations.includes('commit'));assert.ok(!f.operations.includes('rollback'));
 f=confirmationFixture({status:'confirmed'});const duplicate=await confirm({db:f.db,actor,proposalId:'id'});assert.equal(duplicate.duplicate,true);assert.ok(!f.operations.some(x=>x.startsWith('INSERT')));
});
test('expired, stale, cancelled, other-user and changed-role confirmations fail without writes',async()=>{
 for(const options of [{expired:true},{stale:true},{status:'cancelled'},{owned:false},{role:'creator'}]){const f=confirmationFixture(options);await assert.rejects(confirm({db:f.db,actor,proposalId:'id'}));assert.ok(f.operations.includes('rollback'));assert.ok(!f.operations.some(x=>x.startsWith('INSERT')));assert.ok(!f.operations.includes('commit'));}
});
