const { MongoClient } = require('mongodb');

async function countMarkets() {
  const uri = 'mongodb+srv://charanos:960sinned960@cluster0.vlidnbw.mongodb.net/antesocial?appName=Cluster0';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('antesocial');
    const count = await db.collection('public_markets').countDocuments({ isDeleted: { $ne: true } });
    console.log(`Active markets count: ${count}`);
    const samples = await db.collection('public_markets').find({ isDeleted: { $ne: true } }).limit(5).toArray();
    console.log('Sample markets titles:', samples.map(m => m.title));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

countMarkets();
