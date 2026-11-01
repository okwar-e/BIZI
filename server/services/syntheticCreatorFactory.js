const categories=['fitness','food','travel','beauty','technology','gaming','fashion','parenting','finance','comedy'];
const platforms=['Instagram','TikTok','YouTube'];
const locations=['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret'];
const scopes={Instagram:'one Instagram reel',TikTok:'one TikTok video',YouTube:'one YouTube video'};
const seed='bizi-complete-demo-2026-v1';
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function makeCreator(i,now) {
  const niche=categories[i%10],platform=platforms[Math.floor(i/10)%3],location=locations[Math.floor(i/30)%5];
  const followers=1500+((i*7919)%248500),rate=Number((.8+((i*37)%112)/10).toFixed(1));
  const vector=Array.from({length:16},(_,k)=>k===i%10?1:k===10+Math.floor(i/10)%3?.25:k===13+Math.floor(i/30)%3?.1:0);
  return {key:`creator-${String(i+1).padStart(3,'0')}`,name:`SIM ${niche} ${String(i+1).padStart(3,'0')}`,handle:`SIM_${niche}_${String(i+1).padStart(3,'0')}`,
    niche,audienceDescription:`SYNTHETIC: ${18+(i%5)*5}–${27+(i%5)*5} year old ${['students','professionals','parents','enthusiasts'][i%4]} interested in ${niche}; ${location}, English and Swahili.`,platform,location,followers,rate,vector,
    evidence:{dataOrigin:'synthetic',generatorVersion:seed,engagementDefinition:'interactions/followers_percent',embeddingVersion:'synthetic-latent-16-v1',embeddingHash:digest(vector),priceAmount:2500+(i*173)%87500,priceCurrency:'KES',priceScope:scopes[platform],priceVerified:false,priceValidUntil:new Date(now+180*86400000).toISOString()},
    scenario:{verificationState:'simulated_review_complete',simulatedVerifiedEngagement:Number((rate*.95).toFixed(2)),simulatedVerificationAt:new Date(now-7*86400000).toISOString(),simulatedQuoteReviewed:true,audienceCountry:'Kenya',audienceAgeMin:18+(i%5)*5,audienceAgeMax:27+(i%5)*5,contentLanguage:['English','Swahili']}};
}

module.exports={makeCreator,categories,platforms,locations,scopes,seed,digest};

const crypto=require('node:crypto');
