import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ collection: 'audit_logs', timestamps: false })
export class AuditLog {
  @Prop({ required: true, unique: true })
  sequence_number!: number;

  @Prop({ required: true, type: Date, default: Date.now })
  timestamp!: Date;

  @Prop({ required: true })
  eventType!: string;

  @Prop({ required: true, type: Types.ObjectId })
  actorId!: Types.ObjectId;

  @Prop({ default: 'user', enum: ['user', 'admin', 'system'] })
  actorType!: string;

  @Prop()
  entityType?: string;

  @Prop({ type: Types.ObjectId })
  entityId?: Types.ObjectId;

  @Prop({ required: true })
  action!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  beforeState?: any;
  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  afterState?: any;

  @Prop()
  amountCents?: number;

  @Prop()
  relatedEntityType?: string;

  @Prop({ type: Types.ObjectId })
  relatedEntityId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  metadata?: any;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  // ─── Chain Integrity ──────────────────────────
  @Prop()
  previousHash?: string;

  @Prop()
  currentHash?: string;

  @Prop({ default: 'unverified', enum: ['unverified', 'verified', 'tampered'] })
  verificationStatus!: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Indexes
AuditLogSchema.index({ actorId: 1, timestamp: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ eventType: 1, timestamp: -1 });

AuditLogSchema.set('toJSON', {
  transform: (doc, ret) => {
    const obj = ret as any;
    obj.sequenceNumber = obj.sequence_number;
    delete obj.sequence_number;
    return obj;
  },
});

AuditLogSchema.set('toObject', {
  transform: (doc, ret) => {
    const obj = ret as any;
    obj.sequenceNumber = obj.sequence_number;
    delete obj.sequence_number;
    return obj;
  },
});
