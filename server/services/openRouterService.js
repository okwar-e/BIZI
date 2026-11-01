'use strict';
function createOpenRouter({env=process.env,fetchImpl=fetch}={}) {
  const key=env.OPENROUTER_API_KEY,chatModel=env.OPENROUTER_CHAT_MODEL,embeddingModel=env.OPENROUTER_EMBEDDING_MODEL;
  async function request(endpoint,body) {
    const response=await fetchImpl(`https://openrouter.ai/api/v1/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Title':'Bizi'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Object.assign(new Error('Provider request failed'),{status:response.status});
    return response.json();
  }
  return {
    status:()=>({chatConfigured:!!(key&&chatModel),embeddingsConfigured:!!(key&&embeddingModel),chatModel:chatModel||null,embeddingModel:embeddingModel||null}),
    async chat(messages,tools=[]) {
      if(!key||!chatModel)throw new Error('Provider not configured');
      const result=await request('chat/completions',{model:chatModel,messages,max_tokens:900,temperature:.15,provider:{data_collection:'deny'},...(tools.length?{tools,tool_choice:'auto',parallel_tool_calls:false}:{})});
      const message=result.choices?.[0]?.message;if(!message)throw new Error('Invalid provider response');
      return {content:typeof message.content==='string'?message.content:'',toolCalls:Array.isArray(message.tool_calls)?message.tool_calls.slice(0,1):[]};
    },
    async embed(texts) {
      if(!key||!embeddingModel)throw new Error('Embedding provider not configured');
      if(!Array.isArray(texts)||!texts.length||texts.length>24||texts.some(t=>typeof t!=='string'||t.length>5000))throw new Error('Invalid embedding batch');
      const result=await request('embeddings',{model:embeddingModel,input:texts,encoding_format:'float',provider:{data_collection:'deny'}});
      const data=result.data?.slice().sort((a,b)=>a.index-b.index);
      if(!data||data.length!==texts.length||data.some((d,i)=>d.index!==i||!Array.isArray(d.embedding)||!d.embedding.length||d.embedding.length>16384||d.embedding.some(x=>typeof x!=='number'||!Number.isFinite(x))))throw new Error('Invalid embedding response');
      if(data.some(d=>d.embedding.length!==data[0].embedding.length))throw new Error('Mixed embedding dimensions');
      return data.map(d=>d.embedding);
    },
  };
}
module.exports={createOpenRouter};
