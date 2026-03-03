import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type LandingPageDocument = HydratedDocument<LandingPage>;

@Schema({ collection: 'landing_page_settings', timestamps: true })
export class LandingPage {
  @Prop({ required: true, unique: true, default: 'default' })
  key!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  hero!: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  features!: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  gameModes!: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  testimonials!: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  hallOfFame!: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  currency!: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  socialProofStats!: Record<string, unknown>;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const LandingPageSchema = SchemaFactory.createForClass(LandingPage);

LandingPageSchema.index({ key: 1 }, { unique: true });
