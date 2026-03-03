import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Transaction, TransactionDocument } from '../schemas/transaction.schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class TransactionRepository extends BaseRepository<TransactionDocument> {
  constructor(@InjectModel(Transaction.name) model: Model<TransactionDocument>) {
    super(model);
  }

  findByUserId(userId: string, session?: ClientSession) {
    return this.model.find({ userId: new Types.ObjectId(userId) }, undefined, { session }).exec();
  }

  findProviderTransaction(provider: string, externalTransactionId: string, session?: ClientSession) {
    return this.model
      .findOne(
        {
          paymentProvider: provider,
          externalTransactionId,
        },
        undefined,
        { session },
      )
      .exec();
  }
}
