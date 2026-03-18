
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkRecentMarkets() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collection = db.collection('public_markets');
    
    console.log('\n--- Recent AI Markets ---');
    const aiMarkets = await collection.find({ 
      $or: [
        { externalSource: 'ai-agent' },
        { externalSource: 'ai' }
      ]
    }).sort({ createdAt: -1 }).limit(10).toArray();
    
    aiMarkets.forEach(m => {
      console.log(`Title: ${m.title}`);
      console.log(`Source: ${m.externalSource}`);
      console.log(`Status: ${m.status}`);
      console.log(`Created: ${m.createdAt}`);
      console.log('---');
    });

    console.log('\n--- Status Counts ---');
    const counts = await collection.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();
    console.log(counts);

    console.log('\n--- Source Counts ---');
    const sourceCounts = await collection.aggregate([
      { $group: { _id: '$externalSource', count: { $sum: 1 } } }
    ]).toArray();
    console.log(sourceCounts);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkRecentMarkets();
