import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class UserRepository extends BaseRepository<UserDocument> {
  constructor(@InjectModel(User.name) model: Model<UserDocument>) {
    super(model);
  }

  findByEmail(email: string, session?: ClientSession) {
    return this.model.findOne({ email: email.toLowerCase().trim() }, undefined, { session }).exec();
  }

  findByUsername(username: string, session?: ClientSession) {
    return this.model.findOne({ username: username.trim() }, undefined, { session }).exec();
  }

  assignWallet(userId: string, walletId: string, session?: ClientSession) {
    return this.model
      .findByIdAndUpdate(
        new Types.ObjectId(userId),
        { walletId: new Types.ObjectId(walletId) },
        { new: true, session },
      )
      .exec();
  }
}
