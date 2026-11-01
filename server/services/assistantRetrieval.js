'use strict';
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const stop=new Set(['the','a','an','is','are','of','for','to','and','in','this','that','it','my','what','which','why','how','do','does','can','you','me','i','with','please']);
const tokens=text=>[...new Set((text.toLowerCase().match(/[\p{L}\p{N}_]+/gu)||[]).filter(x=>!stop.has(x)))];
function cosine(a,b){if(a.length!==b.length)return 0;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):0;}
function lexical(question,docs){const words=tokens(question);return docs.map(d=>{const ts=tokens(d.title+' '+d.text),matches=words.filter(w=>ts.includes(w)).length;return {...d,relevance:words.length?matches/words.length:0};}).sort((a,b)=>b.relevance-a.relevance||a.id.localeCompare(b.id));}
async function retrieve({db,provider,actorId,question,docs}) {
  let ranked=lexical(question,docs),mode='lexical';
  if(provider.status().embeddingsConfigured) {
    try {
      // Bound provider exposure/cost; authorization happened before candidates were constructed.
      const candidates=ranked.slice(0,20),texts=[question,...candidates.map(d=>`${d.title}\n${d.text}`)],model=provider.status().embeddingModel;
      const keys=texts.map(text=>hash({actorId,model,text})),vectors=[],missing=[];
      for(let i=0;i<keys.length;i++){const [rows]=await db.query('SELECT vectorJson FROM assistant_embedding_cache WHERE cacheKey=? AND actorId=? AND model=? AND expiresAt>NOW()',[keys[i],actorId,model]);if(rows.length)vectors[i]=typeof rows[0].vectorJson==='string'?JSON.parse(rows[0].vectorJson):rows[0].vectorJson;else missing.push(i);}
      if(missing.length){const fetched=await provider.embed(missing.map(i=>texts[i]));for(let j=0;j<missing.length;j++){const i=missing[j];vectors[i]=fetched[j];await db.query('INSERT INTO assistant_embedding_cache(cacheKey,actorId,model,vectorJson,expiresAt) VALUES (?,?,?,?,DATE_ADD(NOW(),INTERVAL 7 DAY)) ON DUPLICATE KEY UPDATE vectorJson=VALUES(vectorJson),expiresAt=VALUES(expiresAt)',[keys[i],actorId,model,JSON.stringify(vectors[i])]);}}
      ranked=candidates.map((d,i)=>({...d,relevance:.5*d.relevance+.5*Math.max(0,cosine(vectors[0],vectors[i+1]))})).sort((a,b)=>b.relevance-a.relevance||a.id.localeCompare(b.id));mode='hybrid';
    } catch {mode='lexical_embedding_unavailable';}
  }
  return {mode,sources:ranked.filter(d=>d.relevance>0.08).slice(0,6).map(({id,title,text})=>({id,title,text}))};
}
module.exports={retrieve,lexical,cosine,hash};
