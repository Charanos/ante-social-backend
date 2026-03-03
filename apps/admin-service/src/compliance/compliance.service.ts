import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction, TransactionDocument } from '@app/database';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
  ) {}

  // This would be called by a Kafka consumer ideally
  async checkTransaction(tx: TransactionDocument) {
    if (tx.amount > 10000) { // $10k threshold
      this.logger.warn(`High value transaction detected: ${tx._id} - $${tx.amount}`);
      // Create flag record
    }
  }
}
