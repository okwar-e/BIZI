'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOpenRouter}=require('../services/openRouterService');
const {toolsFor,validateAction,propose}=require('../services/assistantActions');
const {lexical,cosine,retrieve}=require('../services/assistantRetrieval');
const {validateCitations,normalizeCitations,redact,chat}=require('../services/biziAssistant');
const {loadKnowledge}=require('../services/assistantKnowledge');
const actor={userId:7,role:'business'};
test('tools and arguments cannot cross roles or introduce execution/verification fields',()=>{
 assert.equal(toolsFor('business').length,0);assert.equal(toolsFor('creator').length,2);assert.equal(toolsFor('admin').length,0);
 assert.throws(()=>validateAction('creator','create_campaign',{nicheText:'fitness'}),{status:403});
 assert.throws(()=>validateAction('creator','update_creator_metrics',{selfReportedEngagement:4,followerCount:5,verifiedEngagement:10}),{status:400});
 assert.throws(()=>validateAction('business','generate_recommendations',{campaignId:1}),{status:403});
 assert.throws(()=>validateAction('business','shell',{command:'anything'}),{status:403});
 assert.throws(()=>validateAction('creator','update_creator_metrics',{selfReportedEngagement:101,followerCount:5}),{status:400});
 assert.throws(()=>validateAction('business','create_campaign',{nicheText:'fitness'}),{status:403});
});
test('provider is disabled without configuration and never sends an incomplete request',async()=>{
 let count=0;const p=createOpenRouter({env:{},fetchImpl:async()=>{count++;}});assert.equal(p.status().chatConfigured,false);await assert.rejects(p.chat([]));assert.equal(count,0);
});
test('provider uses fixed endpoint, bounded generation and tool schema; rejects malformed vectors',async()=>{
 const calls=[];const p=createOpenRouter({env:{OPENROUTER_API_KEY:'test-only-fake',OPENROUTER_CHAT_MODEL:'fixture/chat',OPENROUTER_EMBEDDING_MODEL:'fixture/embed'},fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.endsWith('/embeddings')?{data:[{index:0,embedding:['bad']}]}:{choices:[{message:{content:'[help:registration] evidence'}}]}};}});
 await p.chat([{role:'user',content:'test'}],toolsFor('creator'));assert.equal(calls[0].url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(calls[0].body.max_tokens,900);assert.equal(calls[0].body.parallel_tool_calls,false);await assert.rejects(p.embed(['test']));
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
test('business retrieval fails closed on an unowned campaign and never fetches legacy runs',async()=>{
 const queries=[],db={query:async(sql)=>{queries.push(sql);return [[]];}};await assert.rejects(loadKnowledge(db,actor,{campaignId:9}),{status:404});assert.ok(queries.every(sql=>!sql.includes('recommendation_runs_v1')));
});
test('business assistant cannot generate a legacy recommendation or write a proposal',async()=>{
 let writes=0;const db={query:async(sql)=>{if(sql.startsWith('INSERT'))writes++;return [[]];}};
 await assert.rejects(propose({db,actor,name:'generate_recommendations',args:{campaignId:44}}),{status:403});
 assert.equal(writes,0);
});
