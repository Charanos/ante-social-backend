const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkDates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection.db;
    const collection = db.collection('public_markets');

    const m = await collection.findOne({ externalSource: 'ai-agent', status: 'active' });
    console.log('Sample ai-agent active market:');
    console.log(m.title);
    console.log('startTime:', m.startTime);
    console.log('closeTime:', m.closeTime);
    console.log('status:', m.status);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkDates();