import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NewsletterSubscriberDocument = HydratedDocument<NewsletterSubscriber>;

@Schema({ collection: 'newsletter_subscribers', timestamps: true })
export class NewsletterSubscriber {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ default: 'active', enum: ['active', 'unsubscribed'] })
  status!: string;

  @Prop()
  subscribedAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const NewsletterSubscriberSchema = SchemaFactory.createForClass(NewsletterSubscriber);

NewsletterSubscriberSchema.index({ email: 1 }, { unique: true });
NewsletterSubscriberSchema.index({ status: 1 });
