import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types, UpdateQuery } from 'mongoose';
import { Wallet, WalletDocument } from '../schemas/wallet.schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class WalletRepository extends BaseRepository<WalletDocument> {
  constructor(@InjectModel(Wallet.name) model: Model<WalletDocument>) {
    super(model);
  }

  findByUserId(userId: string, session?: ClientSession) {
    return this.model.findOne({ userId: new Types.ObjectId(userId) }, undefined, { session }).exec();
  }

  createForUser(userId: string, session?: ClientSession) {
    return this.create(
      {
        userId: new Types.ObjectId(userId),
        balanceUsd: 0,
        balanceKsh: 0,
      } as unknown as Partial<WalletDocument>,
      session,
    );
  }

  updateByVersion(
    walletId: Types.ObjectId,
    expectedVersion: number,
    update: UpdateQuery<WalletDocument>,
    session?: ClientSession,
  ) {
    return this.model
      .findOneAndUpdate(
        { _id: walletId, version: expectedVersion },
        {
          ...update,
          $inc: {
            ...(update.$inc || {}),
            version: 1,
          },
        },
        { new: true, session },
      )
      .exec();
  }
}
