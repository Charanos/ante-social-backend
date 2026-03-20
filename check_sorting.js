const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkSorting() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('public_markets');

    const top200 = await collection.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(200).toArray();
    let pmCount = 0;
    let aiCount = 0;
    let nativeCount = 0;
    top200.forEach(m => {
      if (m.externalSource === 'polymarket') pmCount++;
      else if (m.externalSource === 'ai-agent') aiCount++;
      else nativeCount++;
    });
    console.log(`Top 200 breakdown: Polymarket=${pmCount}, AI=${aiCount}, Native=${nativeCount}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSorting();