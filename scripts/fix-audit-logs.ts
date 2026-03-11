import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import { AuditLogSchema } from '../libs/database/src/schemas/audit-log.schema';

dotenv.config({ path: '.env.local' });
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function fixAuditLogs() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);

  const AuditLogModel = mongoose.model('AuditLog', AuditLogSchema);

  console.log('Dropping audit_logs collection for a complete reset...');
  try {
    await AuditLogModel.collection.drop();
    console.log('Collection dropped.');
  } catch (e) {
    console.log('Collection already dropped or does not exist.');
  }

  console.log('Verification:');
  const max = await AuditLogModel.findOne().sort({ sequence_number: -1 }).lean();
  console.log('Max sequence_number:', max?.sequence_number);

  console.log('Done.');
  await mongoose.disconnect();
}

fixAuditLogs().catch(console.error);
