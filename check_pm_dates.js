const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkPmDates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('public_markets');

    const top10 = await collection.find({ externalSource: 'polymarket', status: 'active' }).sort({ createdAt: -1 }).limit(10).toArray();
    top10.forEach(m => {
      console.log(m.title, 'closeTime:', m.closeTime, 'endsAt:', m.endsAt, 'status:', m.status);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkPmDates();