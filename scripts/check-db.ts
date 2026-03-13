import { MongoClient } from 'mongodb';

const uri = "mongodb+srv://charanos:960sinned960@cluster0.vlidnbw.mongodb.net/antesocial?appName=Cluster0";

async function checkMarkets() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('antesocial');
    const collection = db.collection('public_markets');

    const total = await collection.countDocuments();
    const polymarkets = await collection.countDocuments({ externalSource: 'polymarket' });
    const native = await collection.countDocuments({ externalSource: { $ne: 'polymarket' } });
    const active = await collection.countDocuments({ status: 'active' });
    const featured = await collection.countDocuments({ isFeatured: true });

    console.log(`Total markets: ${total}`);
    console.log(`Polymarkets: ${polymarkets}`);
    console.log(`Native markets: ${native}`);
    console.log(`Active markets: ${active}`);
    console.log(`Featured markets: ${featured}`);

    const sampleNative = await collection.findOne({ externalSource: { $ne: 'polymarket' } });
    if (sampleNative) {
      console.log('Sample Native Market:', JSON.stringify(sampleNative, null, 2));
    } else {
      console.log('No native markets found.');
    }

  } finally {
    await client.close();
  }
}

checkMarkets().catch(console.error);
