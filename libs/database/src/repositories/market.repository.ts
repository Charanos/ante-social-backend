import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { Market, MarketDocument } from '../schemas/market.schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class MarketRepository extends BaseRepository<MarketDocument> {
  constructor(@InjectModel(Market.name) model: Model<MarketDocument>) {
    super(model);
  }

  findActive(session?: ClientSession) {
    return this.model.find({ status: 'active', isDeleted: { $ne: true } }, undefined, { session }).exec();
  }
}
