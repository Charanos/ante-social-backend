import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MarketCommentDocument = HydratedDocument<MarketComment>;

@Schema({ collection: 'market_comments', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class MarketComment {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  marketId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  username!: string;

  @Prop({ required: true, maxlength: 1000, trim: true })
  body!: string;

  @Prop({ default: 0 })
  likes!: number;

  @Prop({ type: [Types.ObjectId], default: [] })
  likedBy!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, required: false, index: true })
  parentId?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  editedAt?: Date;

  @Prop({ type: String, enum: ['active', 'deleted', 'deletedByAdmin'], default: 'active' })
  status!: string;

  @Prop({ default: false })
  isDeleted!: boolean;
}

export const MarketCommentSchema = SchemaFactory.createForClass(MarketComment);

MarketCommentSchema.index({ marketId: 1, createdAt: -1 });
MarketCommentSchema.index({ parentId: 1, createdAt: 1 });
