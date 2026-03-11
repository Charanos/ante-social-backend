import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type LandingPageDocument = HydratedDocument<LandingPage>;

@Schema({ collection: 'landing_page_settings', timestamps: true })
export class LandingPage {
  @Prop({ required: true, unique: true, default: 'default' })
  key!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  hero!: any;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  features!: any;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  gameModes!: any;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  testimonials!: any;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  hallOfFame!: any;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  currency!: any;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  socialProofStats!: any;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const LandingPageSchema = SchemaFactory.createForClass(LandingPage);

LandingPageSchema.index({ key: 1 }, { unique: true });
