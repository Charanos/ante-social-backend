const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkFutureMarkets() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('public_markets');

    const now = new Date();
    console.log("Current server time:", now.toISOString());

    const futurePm = await collection.countDocuments({ externalSource: 'polymarket', status: 'active', closeTime: { $gt: now } });
    const pastPm = await collection.countDocuments({ externalSource: 'polymarket', status: 'active', closeTime: { $lte: now } });

    console.log(`Polymarket Active Markets - Future: ${futurePm}, Past: ${pastPm}`);

    const futureAi = await collection.countDocuments({ externalSource: 'ai-agent', status: 'active', closeTime: { $gt: now } });
    console.log(`AI-Agent Active Markets - Future: ${futureAi}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkFutureMarkets();