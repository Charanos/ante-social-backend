import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GroupDocument = HydratedDocument<Group>;

// ─── Group Member subdocument ───────────────────────
@Schema({ _id: true })
export class GroupMember {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ default: 'member', enum: ['admin', 'moderator', 'member'] })
  role!: string;

  @Prop({ type: Date, default: Date.now })
  joinedAt!: Date;
}

export const GroupMemberSchema = SchemaFactory.createForClass(GroupMember);

// ─── Group Schema ───────────────────────────────────
@Schema({ collection: 'betting_groups', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Group {
  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop()
  avatarUrl?: string;

  @Prop()
  category?: string;

  @Prop()
  imageUrl?: string;

  @Prop({ default: true })
  isPublic!: boolean;

  @Prop({ unique: true, sparse: true })
  inviteCode?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop({ type: [GroupMemberSchema], default: [] })
  members!: GroupMember[];

  @Prop({ default: 0 })
  memberCount!: number;

  // ─── Group Stats ──────────────────────────────
  @Prop({ default: 0 })
  totalBets!: number;

  @Prop({ default: 0 })
  totalVolume!: number;

  @Prop({ default: 0 })
  activeBetsCount!: number;

  // ─── Group Rules ──────────────────────────────
  @Prop({ default: 50 })
  maxMembers!: number;

  @Prop({ default: 1 })
  minBuyIn!: number;

  @Prop({ default: 1000 })
  maxBuyIn!: number;

  @Prop({ default: false })
  requiresApproval!: boolean;
}

export const GroupSchema = SchemaFactory.createForClass(Group);

// Indexes
GroupSchema.index({ createdBy: 1 });
GroupSchema.index({ isPublic: 1 });
GroupSchema.index({ 'members.userId': 1 });
GroupSchema.index({ category: 1 });
