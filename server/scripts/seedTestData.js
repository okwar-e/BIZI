const bcrypt = require('bcrypt');
const db = require('../config/db');
const { createUser } = require('../models/userModel');
const {
  createOrUpdateProfile,
  updateSelfReportedMetrics,
} = require('../models/creatorProfileModel');
const { createCampaign } = require('../models/campaignModel');

const creators = [
  { niche: 'fitness and wellness', audienceDescription: 'Young adults aged 18-30 interested in gym routines and healthy living', platforms: 'TikTok,Instagram', location: 'Nairobi', selfReportedEngagement: 8.4, followerCount: 15000 },
  { niche: 'gym and nutrition content', audienceDescription: 'Busy professionals seeking practical workouts and meal preparation', platforms: 'YouTube,Instagram', location: 'Nairobi', selfReportedEngagement: 6.2, followerCount: 84000 },
  { niche: 'home workouts', audienceDescription: 'Parents and beginners looking for simple exercise plans at home', platforms: 'TikTok', location: 'Mombasa', selfReportedEngagement: 10.1, followerCount: 4200 },
  { niche: 'natural beauty and skincare', audienceDescription: 'Women aged 20-35 interested in affordable clean beauty products', platforms: 'Instagram,YouTube', location: 'Nairobi', selfReportedEngagement: 7.8, followerCount: 32000 },
  { niche: 'makeup tutorials', audienceDescription: 'College students learning everyday makeup and beauty techniques', platforms: 'TikTok,Instagram', location: 'Mombasa', selfReportedEngagement: 9.6, followerCount: 12500 },
  { niche: 'haircare and protective styles', audienceDescription: 'Young women interested in natural hair maintenance and styling', platforms: 'Instagram', location: 'Kisumu', selfReportedEngagement: 5.4, followerCount: 68000 },
  { niche: 'consumer technology reviews', audienceDescription: 'Tech enthusiasts aged 18-40 comparing phones, laptops, and gadgets', platforms: 'YouTube,Instagram', location: 'Nairobi', selfReportedEngagement: 4.1, followerCount: 110000 },
  { niche: 'mobile apps and digital tools', audienceDescription: 'Students and freelancers looking for productivity and finance apps', platforms: 'TikTok,YouTube', location: 'Nairobi', selfReportedEngagement: 6.7, followerCount: 7600 },
  { niche: 'gaming and esports', audienceDescription: 'Teenagers and young adults who follow competitive console and PC gaming', platforms: 'YouTube,TikTok', location: 'Nairobi', selfReportedEngagement: 11.2, followerCount: 54000 },
  { niche: 'indie game streaming', audienceDescription: 'Gamers who enjoy live playthroughs, reviews, and multiplayer events', platforms: 'YouTube', location: 'Mombasa', selfReportedEngagement: 3.8, followerCount: 190000 },
  { niche: 'home cooking and recipes', audienceDescription: 'Families and young professionals seeking quick affordable meals', platforms: 'Instagram,TikTok', location: 'Nairobi', selfReportedEngagement: 8.1, followerCount: 27000 },
  { niche: 'street food and restaurant reviews', audienceDescription: 'Food lovers aged 21-40 discovering local dining experiences', platforms: 'TikTok,Instagram,YouTube', location: 'Mombasa', selfReportedEngagement: 9.1, followerCount: 91000 },
  { niche: 'plant-based nutrition', audienceDescription: 'Health-conscious adults interested in vegetarian meals and nutrition', platforms: 'Instagram', location: 'Nairobi', selfReportedEngagement: 6.5, followerCount: 3100 },
  { niche: 'streetwear and contemporary fashion', audienceDescription: 'Urban Gen Z audiences interested in affordable outfits and styling', platforms: 'TikTok,Instagram', location: 'Nairobi', selfReportedEngagement: 7.2, followerCount: 46000 },
  { niche: 'modest fashion and accessories', audienceDescription: 'Women aged 25-45 looking for elegant everyday clothing ideas', platforms: 'Instagram,YouTube', location: 'Kisumu', selfReportedEngagement: 4.8, followerCount: 18500 },
  { niche: 'sustainable fashion', audienceDescription: 'Eco-conscious shoppers interested in thrifted and ethical clothing', platforms: 'Instagram,TikTok', location: 'Nairobi', selfReportedEngagement: 5.9, followerCount: 2300 },
  { niche: 'budget travel adventures', audienceDescription: 'Young adults planning affordable regional trips and weekend escapes', platforms: 'YouTube,Instagram', location: 'Nairobi', selfReportedEngagement: 8.8, followerCount: 72000 },
  { niche: 'coastal travel and beaches', audienceDescription: 'Families and couples looking for hotels, beaches, and coastal activities', platforms: 'TikTok,Instagram', location: 'Mombasa', selfReportedEngagement: 6.9, followerCount: 38000 },
  { niche: 'adventure hiking', audienceDescription: 'Active professionals interested in trails, camping, and outdoor gear', platforms: 'YouTube', location: 'Nakuru', selfReportedEngagement: 3.2, followerCount: 9800 },
  { niche: 'travel photography', audienceDescription: 'Visual storytellers and destination lovers aged 20-35', platforms: 'Instagram', location: 'Nairobi', selfReportedEngagement: 7.5, followerCount: 61000 },
  { niche: 'positive parenting', audienceDescription: 'Parents of toddlers and school-age children seeking practical advice', platforms: 'Instagram,YouTube', location: 'Nairobi', selfReportedEngagement: 5.6, followerCount: 17500 },
  { niche: 'family activities and kids education', audienceDescription: 'Parents looking for learning games, books, and weekend activities', platforms: 'TikTok,Instagram', location: 'Mombasa', selfReportedEngagement: 8.7, followerCount: 6400 },
  { niche: 'newborn care and motherhood', audienceDescription: 'Expecting and new mothers seeking supportive early-parenting guidance', platforms: 'Instagram', location: 'Nairobi', selfReportedEngagement: 4.4, followerCount: 118000 },
  { niche: 'personal finance and saving', audienceDescription: 'Young workers learning budgeting, saving, and responsible money habits', platforms: 'YouTube,TikTok', location: 'Nairobi', selfReportedEngagement: 6.1, followerCount: 26000 },
  { niche: 'small business finance', audienceDescription: 'Entrepreneurs seeking bookkeeping, cash flow, and business growth tips', platforms: 'LinkedIn,YouTube', location: 'Nairobi', selfReportedEngagement: 2.7, followerCount: 5300 },
  { niche: 'investing for beginners', audienceDescription: 'Adults aged 25-45 exploring long-term investing and wealth planning', platforms: 'YouTube', location: 'Nairobi', selfReportedEngagement: 3.9, followerCount: 87000 },
  { niche: 'sketch comedy and everyday humor', audienceDescription: 'Broad young adult audiences who enjoy short relatable comedy videos', platforms: 'TikTok,Instagram', location: 'Nairobi', selfReportedEngagement: 12, followerCount: 145000 },
  { niche: 'parenting comedy', audienceDescription: 'Parents and families who enjoy humorous stories about home life', platforms: 'TikTok,YouTube', location: 'Mombasa', selfReportedEngagement: 10.8, followerCount: 20500 },
  { niche: 'office life satire', audienceDescription: 'Corporate workers looking for witty observations about work and relationships', platforms: 'Instagram', location: 'Nairobi', selfReportedEngagement: 7.1, followerCount: 3600 },
  { niche: 'stand-up comedy and pop culture', audienceDescription: 'Entertainment fans aged 18-35 who follow jokes, shows, and celebrity commentary', platforms: 'YouTube,Instagram', location: 'Nairobi', selfReportedEngagement: 5.1, followerCount: 78000 },
];

const campaigns = [
  { nicheText: 'Fitness and wellness products', targetAudience: 'University students and young adults who exercise', budgetRange: 'KES 30000-50000', preferredPlatforms: 'TikTok,Instagram', location: 'Nairobi', campaignGoal: 'Build awareness for a new protein bar' },
  { nicheText: 'Clean skincare and natural beauty', targetAudience: 'Women aged 20-35 seeking affordable skincare', budgetRange: 'KES 50000-80000', preferredPlatforms: 'Instagram,YouTube', location: 'Nairobi', campaignGoal: 'Drive product trials for a facial care range' },
  { nicheText: 'Mobile technology and productivity apps', targetAudience: 'Students and freelancers who use digital tools', budgetRange: 'KES 20000-40000', preferredPlatforms: 'TikTok,YouTube', location: 'Nairobi', campaignGoal: 'Increase app downloads' },
  { nicheText: 'Healthy home cooking', targetAudience: 'Families seeking convenient affordable meal ideas', budgetRange: 'KES 25000-45000', preferredPlatforms: 'Instagram,TikTok', location: 'Nairobi', campaignGoal: 'Promote a new pantry food brand' },
  { nicheText: 'Coastal travel experiences', targetAudience: 'Couples and families planning beach holidays', budgetRange: 'KES 60000-100000', preferredPlatforms: 'TikTok,Instagram,YouTube', location: 'Mombasa', campaignGoal: 'Increase hotel bookings' },
  { nicheText: 'Urban streetwear fashion', targetAudience: 'Gen Z shoppers who want affordable outfit inspiration', budgetRange: 'KES 40000-70000', preferredPlatforms: 'TikTok,Instagram', location: 'Nairobi', campaignGoal: 'Launch a new clothing collection' },
  { nicheText: 'Gaming accessories and esports', targetAudience: 'Teenagers and young adult competitive gamers', budgetRange: 'KES 70000-120000', preferredPlatforms: 'YouTube,TikTok', location: 'Nairobi', campaignGoal: 'Promote a gaming headset' },
  { nicheText: 'Practical parenting advice', targetAudience: 'Parents of toddlers and primary school children', budgetRange: 'KES 30000-60000', preferredPlatforms: 'Instagram,YouTube', location: 'Nairobi', campaignGoal: 'Introduce an educational activity subscription' },
  { nicheText: 'Personal budgeting and saving', targetAudience: 'Young professionals learning to manage money', budgetRange: 'KES 45000-75000', preferredPlatforms: 'YouTube,TikTok', location: 'Nairobi', campaignGoal: 'Acquire users for a savings app' },
  { nicheText: 'Relatable short-form comedy', targetAudience: 'Young adults who enjoy everyday humor and sketches', budgetRange: 'KES 35000-55000', preferredPlatforms: 'TikTok,Instagram', location: 'Nairobi', campaignGoal: 'Create shareable brand awareness content' },
  { nicheText: 'Ethical and sustainable clothing', targetAudience: 'Eco-conscious shoppers interested in thrift fashion', budgetRange: 'KES 25000-50000', preferredPlatforms: 'Instagram,TikTok', location: 'Nairobi', campaignGoal: 'Promote a sustainable clothing marketplace' },
  { nicheText: 'Adventure hiking and outdoor gear', targetAudience: 'Active adults who enjoy trails and camping', budgetRange: 'KES 30000-65000', preferredPlatforms: 'YouTube,Instagram', location: 'Nakuru', campaignGoal: 'Promote a new hiking backpack' },
  { nicheText: 'Small business bookkeeping', targetAudience: 'Entrepreneurs running growing local businesses', budgetRange: 'KES 50000-90000', preferredPlatforms: 'YouTube,LinkedIn', location: 'Nairobi', campaignGoal: 'Generate qualified software leads' },
  { nicheText: 'Makeup and hair styling', targetAudience: 'College students interested in beauty tutorials', budgetRange: 'KES 30000-50000', preferredPlatforms: 'TikTok,Instagram', location: 'Mombasa', campaignGoal: 'Launch a beauty accessories line' },
  { nicheText: 'Luxury car modification', targetAudience: 'Car enthusiasts interested in high-end customization', budgetRange: 'KES 80000-150000', preferredPlatforms: 'YouTube', location: 'Eldoret', campaignGoal: 'Test a deliberately narrow creator match' },
];

async function seedCreator(index, profile, passwordHash) {
  const creatorNumber = index + 1;
  const userId = await createUser({
    name: `Synthetic Creator ${creatorNumber}`,
    email: `creator${creatorNumber}@synthetic.test`,
    passwordHash,
    role: 'creator',
  });

  const [creatorResult] = await db.query(
    `INSERT INTO creators (userId, publicHandle) VALUES (?, ?)`,
    [userId, `synthetic_creator_${creatorNumber}`]
  );

  const profileId = await createOrUpdateProfile(creatorResult.insertId, profile);
  await updateSelfReportedMetrics(creatorResult.insertId, {
    selfReportedEngagement: profile.selfReportedEngagement,
    followerCount: profile.followerCount,
  });
  return { userId, creatorId: creatorResult.insertId, profileId };
}

async function seedCampaign(index, campaign, passwordHash) {
  const campaignNumber = index + 1;
  const userId = await createUser({
    name: `Synthetic Campaign Business ${campaignNumber}`,
    email: `bizcamp${campaignNumber}@synthetic.test`,
    passwordHash,
    role: 'business',
  });

  const [businessResult] = await db.query(
    `INSERT INTO businesses (userId, businessName, industry) VALUES (?, ?, ?)`,
    [userId, `Synthetic Business ${campaignNumber}`, 'Synthetic Test Data']
  );

  const campaignId = await createCampaign(businessResult.insertId, campaign);
  return { userId, businessId: businessResult.insertId, campaignId };
}

async function seedTestData() {
  const seedPassword = process.env.BIZI_TEST_SEED_PASSWORD;
  if (typeof seedPassword !== 'string' || seedPassword.length < 12) {
    throw new Error('Set BIZI_TEST_SEED_PASSWORD to a local test password of at least 12 characters.');
  }
  const passwordHash = await bcrypt.hash(seedPassword, 10);
  let creatorsSeeded = 0;
  let campaignsSeeded = 0;

  for (let index = 0; index < creators.length; index += 1) {
    try {
      await seedCreator(index, creators[index], passwordHash);
      creatorsSeeded += 1;
      console.log(`Seeded creator ${index + 1}/${creators.length}...`);
    } catch (error) {
      console.error(`Failed creator ${index + 1}/${creators.length}: ${error.message}`);
    }
  }

  for (let index = 0; index < campaigns.length; index += 1) {
    try {
      await seedCampaign(index, campaigns[index], passwordHash);
      campaignsSeeded += 1;
      console.log(`Seeded campaign ${index + 1}/${campaigns.length}...`);
    } catch (error) {
      console.error(`Failed campaign ${index + 1}/${campaigns.length}: ${error.message}`);
    }
  }

  console.log(`Seed complete: ${creatorsSeeded} creators and ${campaignsSeeded} campaigns seeded.`);
}

if (require.main === module) {
  seedTestData()
    .catch((error) => {
      console.error(`Seed failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.end();
    });
}

module.exports = {
  creators,
  campaigns,
  seedTestData,
};
