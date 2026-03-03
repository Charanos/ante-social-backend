import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ComplianceFlagDocument = ComplianceFlag & Document;

export enum FlagStatus {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum FlagReason {
  STRUCTURING = 'structuring',
  RAPID_DEPOSITS = 'rapid_deposits',
  UNUSUAL_PATTERN = 'unusual_pattern',
  VELOCITY_BREACH = 'velocity_breach',
  MANUAL_REPORT = 'manual_report',
}

@Schema({ timestamps: true })
export class ComplianceFlag {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: FlagReason, required: true })
  reason!: FlagReason;

  @Prop({ type: String, enum: FlagStatus, default: FlagStatus.OPEN })
  status!: FlagStatus;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>; // Evidence data

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewNotes?: string;

  @Prop()
  resolvedAt?: Date;
}

export const ComplianceFlagSchema = SchemaFactory.createForClass(ComplianceFlag);
ComplianceFlagSchema.index({ userId: 1, status: 1 });
ComplianceFlagSchema.index({ status: 1, createdAt: -1 });
