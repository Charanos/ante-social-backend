import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ collection: 'audit_logs', timestamps: false })
export class AuditLog {
  @Prop({ required: true, unique: true })
  sequenceNumber!: number;

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

  @Prop({ type: Object })
  beforeState?: Record<string, any>;

  @Prop({ type: Object })
  afterState?: Record<string, any>;

  @Prop()
  amountCents?: number;

  @Prop()
  relatedEntityType?: string;

  @Prop({ type: Types.ObjectId })
  relatedEntityId?: Types.ObjectId;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

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
