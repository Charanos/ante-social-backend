import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import { AuditLogSchema } from '../libs/database/src/schemas/audit-log.schema';

dotenv.config({ path: '.env.local' });
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function debugAuditLogs() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined');
  }

  await mongoose.connect(MONGODB_URI);
  const AuditLogModel = mongoose.model('AuditLog', AuditLogSchema);

  console.log('--- Audit Logs Content ---');
  const logs = await AuditLogModel.find({}).sort({ sequence_number: -1 }).limit(20).lean();
  console.log(JSON.stringify(logs, null, 2));

  console.log('--- Collection Info ---');
  const count = await AuditLogModel.countDocuments({});
  console.log(`Total count: ${count}`);

  const indexes = await AuditLogModel.collection.getIndexes();
  console.log('Indexes:', JSON.stringify(indexes, null, 2));

  await mongoose.disconnect();
}

debugAuditLogs().catch(console.error);
