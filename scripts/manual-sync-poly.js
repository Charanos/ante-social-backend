const mongoose = require('mongoose');
const axios = require('axios');

async function sync() {
  const uri = 'mongodb+srv://charanos:960sinned960@cluster0.vlidnbw.mongodb.net/antesocial?appName=Cluster0';
  await mongoose.connect(uri);
  console.log('Connected to DB');

  try {
    // 1. Fetch Trending from Gamma
    console.log('Fetching trending markets...');
    const resp = await axios.get('https://gamma-api.polymarket.com/markets', {
      params: { limit: 10, is_active: true, is_trending: true }
    });
    const markets = resp.data;
    console.log(`Found ${markets.length} trending markets`);

    const Market = mongoose.connection.collection('public_markets');
    const User = mongoose.connection.collection('users');

    // Find admin user for creatorId
    const admin = await User.findOne({ roles: 'admin' }) || await User.findOne({});
    const creatorId = admin ? admin._id : new mongoose.Types.ObjectId();

    for (const poly of markets) {
      const externalId = poly.id;
      
      const existing = await Market.findOne({ externalId, externalSource: 'polymarket' });
      
      if (existing) {
        console.log(`Updating existing market: ${poly.question}`);
        await Market.updateOne(
          { _id: existing._id },
          { 
            $set: { 
              status: poly.active ? 'active' : 'closed',
              poolAmount: poly.liquidity || 0,
              total_pool: poly.liquidity || 0
            } 
          }
        );
      } else {
        console.log(`Creating new market: ${poly.question}`);
        const outcomes = (poly.tokens || []).map((t, i) => ({
          id: t.token_id || "poly_" + i,
          option_text: t.outcome || `Option ${i+1}`,
          votes: 1,
          percentage: Math.round((t.price || 0) * 100),
          total_amount: (t.price || 0) * 1000,
          image: poly.image || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe"
        }));

        await Market.insertOne({
          title: poly.question,
          description: poly.description || "Real-world insight powered by Polymarket",
          image: poly.image || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe",
          category: (poly.tags && poly.tags[0]) || 'Global',
          marketType: 'consensus',
          buy_in_amount: 1,
          minStake: 1,
          poolAmount: poly.liquidity || 0,
          total_pool: poly.liquidity || 0,
          participantCount: 0,
          status: poly.active ? 'active' : 'closed',
          close_date: new Date(poly.endDate),
          endsAt: poly.endDate,
          options: outcomes,
          participants: [],
          creatorId: creatorId,
          externalId: externalId,
          externalSource: 'polymarket',
          isTrending: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }
    console.log('Sync complete');

    const count = await Market.countDocuments({ externalSource: 'polymarket' });
    console.log(`Total Polymarket markets in DB: ${count}`);

  } catch (error) {
    console.error('Sync failed:', error.message);
    if (error.response) console.error('Response data:', error.response.data);
  } finally {
    await mongoose.disconnect();
  }
}

sync();
