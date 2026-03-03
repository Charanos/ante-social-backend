import { Injectable } from '@nestjs/common';
import { ClientSession, FilterQuery, Model, ProjectionType, UpdateQuery } from 'mongoose';

@Injectable()
export class BaseRepository<TDocument> {
  constructor(protected readonly model: Model<TDocument>) {}

  findOne(
    filter: FilterQuery<TDocument>,
    projection?: ProjectionType<TDocument>,
    session?: ClientSession,
  ) {
    return this.model.findOne(filter, projection, { session }).exec();
  }

  findById(id: string, projection?: ProjectionType<TDocument>, session?: ClientSession) {
    return this.model.findById(id, projection, { session }).exec();
  }

  findMany(
    filter: FilterQuery<TDocument>,
    projection?: ProjectionType<TDocument>,
    session?: ClientSession,
  ) {
    return this.model.find(filter, projection, { session }).exec();
  }

  async create(input: Partial<TDocument>, session?: ClientSession) {
    const created = new this.model(input);
    return created.save({ session });
  }

  updateOne(
    filter: FilterQuery<TDocument>,
    update: UpdateQuery<TDocument>,
    session?: ClientSession,
  ) {
    return this.model.updateOne(filter, update, { session }).exec();
  }

  findOneAndUpdate(
    filter: FilterQuery<TDocument>,
    update: UpdateQuery<TDocument>,
    session?: ClientSession,
  ) {
    return this.model
      .findOneAndUpdate(filter, update, { new: true, session })
      .exec();
  }

  deleteOne(filter: FilterQuery<TDocument>, session?: ClientSession) {
    return this.model.deleteOne(filter, { session }).exec();
  }
}
