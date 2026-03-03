import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BlogDocument = HydratedDocument<Blog>;

@Schema({ collection: 'blogs', timestamps: true })
export class Blog {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  slug!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ trim: true })
  excerpt?: string;

  @Prop()
  coverImage?: string;

  @Prop({ trim: true })
  author?: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ default: 'draft', enum: ['draft', 'published', 'archived'] })
  status!: string;

  @Prop({ default: 0 })
  views!: number;

  @Prop({ default: 5 })
  readTime!: number;

  @Prop()
  publishedAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const BlogSchema = SchemaFactory.createForClass(Blog);

BlogSchema.index({ slug: 1 }, { unique: true });
BlogSchema.index({ status: 1, publishedAt: -1 });
BlogSchema.index({ tags: 1 });
