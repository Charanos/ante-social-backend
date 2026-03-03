import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  ClientSession,
  Connection,
  Model,
  Types,
  UpdateQuery,
} from 'mongoose';
import {
  DailyLimit,
  DailyLimitDocument,
  Transaction,
  TransactionDocument,
  User,
  UserDocument,
  Wallet,
  WalletDocument,
} from '@app/database';
import {
  DAILY_LIMITS,
  DepositDto,
  TransactionStatus,
  TransactionType,
  UserTier,
  WithdrawDto,
} from '@app/common';
import { ClientKafka } from '@nestjs/microservices';
import { WalletTransactionEvent } from '@app/kafka';

type LimitType = 'deposit' | 'withdrawal';
type LimitUsageField =
  | 'depositUsedUsd'
  | 'depositUsedKsh'
  | 'withdrawalUsedUsd'
  | 'withdrawalUsedKsh';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(DailyLimit.name) private dailyLimitModel: Model<DailyLimitDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async createWallet(userId: string, session?: ClientSession) {
    const userObjectId = new Types.ObjectId(userId);
    const existing = await this.walletModel.findOne({ userId: userObjectId }, undefined, { session });
    if (existing) {
      return existing;
    }

    try {
      const wallet = new this.walletModel({
        userId: userObjectId,
        balanceUsd: 0,
        balanceKsh: 0,
      });
      const savedWallet = await wallet.save({ session });

      await this.userModel.updateOne(
        { _id: userObjectId },
        { $set: { walletId: savedWallet._id } },
        { session },
      );

      return savedWallet;
    } catch (error: any) {
      if (error?.code === 11000) {
        const wallet = await this.walletModel.findOne({ userId: userObjectId }, undefined, { session });
        if (wallet) {
          return wallet;
        }
      }
      throw error;
    }
  }

  async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      balances: {
        USD: { available: wallet.balanceUsd, pending: wallet.pendingUsd || 0 },
        KSH: { available: wallet.balanceKsh, pending: wallet.pendingKsh || 0 },
      },
      totalDeposits: wallet.totalDeposits,
      totalWithdrawals: wallet.totalWithdrawals,
      totalWinnings: wallet.totalWinnings,
      totalLosses: wallet.totalLosses,
    };
  }

  async getTransactions(userId: string, limit = 20, offset = 0) {
    const userObjectId = new Types.ObjectId(userId);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .exec(),
      this.transactionModel.countDocuments({ userId: userObjectId }),
    ]);

    return { data: transactions, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  async getDailyLimits(userId: string) {
    const userTier = await this.getUserTier(userId);
    const limits = DAILY_LIMITS[userTier] || DAILY_LIMITS[UserTier.NOVICE];
    const today = new Date().toISOString().split('T')[0];

    const record = await this.dailyLimitModel
      .findOne({ userId: new Types.ObjectId(userId), date: today })
      .lean()
      .exec();

    const depositUsedUsd = Number(record?.depositUsedUsd || 0);
    const depositUsedKsh = Number(record?.depositUsedKsh || 0);
    const withdrawalUsedUsd = Number(record?.withdrawalUsedUsd || 0);
    const withdrawalUsedKsh = Number(record?.withdrawalUsedKsh || 0);

    return {
      tier: userTier,
      date: today,
      minimums: {
        deposit: 10,
        withdrawal: 50,
      },
      deposit: {
        max: limits.deposit,
        used: {
          USD: depositUsedUsd,
          KSH: depositUsedKsh,
        },
        remaining: {
          USD: Math.max(0, limits.deposit - depositUsedUsd),
          KSH: Math.max(0, limits.deposit - depositUsedKsh),
        },
      },
      withdrawal: {
        max: limits.withdrawal,
        used: {
          USD: withdrawalUsedUsd,
          KSH: withdrawalUsedKsh,
        },
        remaining: {
          USD: Math.max(0, limits.withdrawal - withdrawalUsedUsd),
          KSH: Math.max(0, limits.withdrawal - withdrawalUsedKsh),
        },
      },
    };
  }

  async initiateDeposit(userId: string, depositDto: DepositDto) {
    const tx = await this.withMongoTransaction(async (session) => {
      const wallet = await this.getOrCreateWallet(userId, session);
      await this.checkDailyLimit(
        userId,
        depositDto.amount,
        'deposit',
        depositDto.currency,
        session,
      );

      const pending = new this.transactionModel({
        userId: new Types.ObjectId(userId),
        walletId: wallet._id,
        type: TransactionType.DEPOSIT,
        amount: depositDto.amount,
        currency: depositDto.currency,
        description: `${depositDto.currency} deposit`,
        status: TransactionStatus.PENDING,
        paymentProvider: depositDto.currency === 'KSH' ? 'mpesa' : 'nowpayments',
        paymentMetadata: {
          phoneNumber: depositDto.phoneNumber,
        },
      });
      return pending.save({ session });
    });

    return {
      transactionId: tx._id,
      status: 'pending',
      message: 'Deposit initiated',
    };
  }

  async initiateWithdrawal(userId: string, withdrawDto: WithdrawDto) {
    if (withdrawDto.currency === 'USD' && withdrawDto.cryptoAddress) {
      this.validateTronAddress(withdrawDto.cryptoAddress);
    }

    const tx = await this.withMongoTransaction(async (session) => {
      await this.checkDailyLimit(
        userId,
        withdrawDto.amount,
        'withdrawal',
        withdrawDto.currency,
        session,
      );

      const wallet = await this.applyWalletUpdateWithRetry(
        userId,
        (currentWallet) => {
          if (withdrawDto.currency === 'USD') {
            if (currentWallet.balanceUsd < withdrawDto.amount) {
              throw new BadRequestException('Insufficient balance');
            }
            return {
              $inc: {
                balanceUsd: -withdrawDto.amount,
                pendingUsd: withdrawDto.amount,
              },
            } as UpdateQuery<WalletDocument>;
          }

          if (currentWallet.balanceKsh < withdrawDto.amount) {
            throw new BadRequestException('Insufficient balance');
          }
          return {
            $inc: {
              balanceKsh: -withdrawDto.amount,
              pendingKsh: withdrawDto.amount,
            },
          } as UpdateQuery<WalletDocument>;
        },
        session,
      );

      const pending = new this.transactionModel({
        userId: new Types.ObjectId(userId),
        walletId: wallet._id,
        type: TransactionType.WITHDRAWAL,
        amount: withdrawDto.amount,
        currency: withdrawDto.currency,
        description: `${withdrawDto.currency} withdrawal`,
        status: TransactionStatus.PENDING,
        paymentProvider: withdrawDto.currency === 'KSH' ? 'mpesa' : 'nowpayments',
        paymentMetadata: {
          phoneNumber: withdrawDto.phoneNumber,
          cryptoAddress: withdrawDto.cryptoAddress,
        },
      });
      return pending.save({ session });
    });

    this.emitWalletEvent({
      userId,
      transactionId: tx._id.toString(),
      type: TransactionType.WITHDRAWAL,
      amount: withdrawDto.amount,
      currency: withdrawDto.currency,
      status: TransactionStatus.PENDING,
      description: `${withdrawDto.currency} withdrawal`,
    });

    return {
      transactionId: tx._id,
      status: 'pending',
      message: 'Withdrawal request submitted for approval',
    };
  }

  async createProviderDepositTransaction(params: {
    userId: string;
    amount: number;
    currency: string;
    provider: string;
    paymentMetadata?: Record<string, unknown>;
    externalTransactionId?: string;
    description?: string;
  }) {
    const tx = await this.withMongoTransaction(async (session) => {
      const wallet = await this.getOrCreateWallet(params.userId, session);
      await this.checkDailyLimit(
        params.userId,
        params.amount,
        'deposit',
        params.currency,
        session,
      );

      const pending = new this.transactionModel({
        userId: new Types.ObjectId(params.userId),
        walletId: wallet._id,
        type: TransactionType.DEPOSIT,
        amount: params.amount,
        currency: params.currency,
        description: params.description || `${params.currency} deposit`,
        status: TransactionStatus.PENDING,
        paymentProvider: params.provider,
        externalTransactionId: params.externalTransactionId,
        paymentMetadata: params.paymentMetadata || {},
      });

      return pending.save({ session });
    });

    return tx;
  }

  async markTransactionProcessing(
    transactionId: string,
    updates?: {
      externalTransactionId?: string;
      paymentMetadata?: Record<string, unknown>;
    },
  ) {
    const tx = await this.transactionModel.findById(transactionId);
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }

    if (tx.status === TransactionStatus.COMPLETED || tx.status === TransactionStatus.FAILED) {
      return tx;
    }

    tx.status = TransactionStatus.PROCESSING;
    if (updates?.externalTransactionId) {
      tx.externalTransactionId = updates.externalTransactionId;
    }
    if (updates?.paymentMetadata) {
      tx.paymentMetadata = {
        ...(tx.paymentMetadata || {}),
        ...updates.paymentMetadata,
      };
    }

    return tx.save();
  }

  async completePendingDeposit(
    transactionId: string,
    payload?: {
      externalTransactionId?: string;
      paymentMetadata?: Record<string, unknown>;
      creditedAmount?: number;
    },
  ) {
    const completed = await this.withMongoTransaction(async (session) => {
      const tx = await this.transactionModel.findById(transactionId, undefined, { session });
      if (!tx) {
        throw new NotFoundException('Transaction not found');
      }

      if (tx.type !== TransactionType.DEPOSIT) {
        throw new BadRequestException('Transaction is not a deposit');
      }

      if (tx.status === TransactionStatus.COMPLETED) {
        return tx;
      }

      if (tx.status === TransactionStatus.FAILED) {
        throw new BadRequestException('Cannot complete a failed transaction');
      }

      const creditAmount = payload?.creditedAmount ?? tx.amount;
      const wallet = await this.applyWalletUpdateWithRetry(
        tx.userId.toString(),
        () => {
          if (tx.currency === 'USD') {
            return {
              $inc: {
                balanceUsd: creditAmount,
                totalDeposits: creditAmount,
              },
            } as UpdateQuery<WalletDocument>;
          }

          return {
            $inc: {
              balanceKsh: creditAmount,
              totalDeposits: creditAmount,
            },
          } as UpdateQuery<WalletDocument>;
        },
        session,
      );

      tx.walletId = wallet._id;
      tx.status = TransactionStatus.COMPLETED;
      tx.externalTransactionId = payload?.externalTransactionId || tx.externalTransactionId;
      tx.paymentMetadata = {
        ...(tx.paymentMetadata || {}),
        ...(payload?.paymentMetadata || {}),
      };
      tx.amount = creditAmount;
      await tx.save({ session });
      return tx;
    });

    this.emitWalletEvent({
      userId: completed.userId.toString(),
      transactionId: completed._id.toString(),
      type: completed.type,
      amount: completed.amount,
      currency: completed.currency,
      status: completed.status,
      description: completed.description,
    });

    return completed;
  }

  async failPendingTransaction(
    transactionId: string,
    reason: string,
    updates?: {
      externalTransactionId?: string;
      paymentMetadata?: Record<string, unknown>;
    },
  ) {
    const failed = await this.withMongoTransaction(async (session) => {
      const tx = await this.transactionModel.findById(transactionId, undefined, { session });
      if (!tx) {
        throw new NotFoundException('Transaction not found');
      }

      if (tx.status === TransactionStatus.FAILED || tx.status === TransactionStatus.COMPLETED) {
        return tx;
      }

      if (tx.type === TransactionType.WITHDRAWAL) {
        await this.applyWalletUpdateWithRetry(
          tx.userId.toString(),
          () => {
            if (tx.currency === 'USD') {
              return {
                $inc: {
                  pendingUsd: -tx.amount,
                  balanceUsd: tx.amount,
                },
              } as UpdateQuery<WalletDocument>;
            }
            return {
              $inc: {
                pendingKsh: -tx.amount,
                balanceKsh: tx.amount,
              },
            } as UpdateQuery<WalletDocument>;
          },
          session,
        );
      }

      tx.status = TransactionStatus.FAILED;
      tx.description = `${tx.description} (${reason})`;
      if (updates?.externalTransactionId) {
        tx.externalTransactionId = updates.externalTransactionId;
      }
      if (updates?.paymentMetadata) {
        tx.paymentMetadata = {
          ...(tx.paymentMetadata || {}),
          ...updates.paymentMetadata,
        };
      }
      await tx.save({ session });
      return tx;
    });

    this.emitWalletEvent({
      userId: failed.userId.toString(),
      transactionId: failed._id.toString(),
      type: failed.type,
      amount: failed.amount,
      currency: failed.currency,
      status: failed.status,
      description: failed.description,
    });

    return failed;
  }

  async creditBalance(
    userId: string,
    amount: number,
    currency: string,
    description: string,
    type: string,
  ) {
    const savedTx = await this.withMongoTransaction(async (session) => {
      const wallet = await this.applyWalletUpdateWithRetry(
        userId,
        () => {
          if (currency === 'USD') {
            return {
              $inc: {
                balanceUsd: amount,
                totalDeposits: type === TransactionType.DEPOSIT ? amount : 0,
                totalWinnings: type === TransactionType.BET_PAYOUT ? amount : 0,
              },
            } as UpdateQuery<WalletDocument>;
          }
          return {
            $inc: {
              balanceKsh: amount,
            },
          } as UpdateQuery<WalletDocument>;
        },
        session,
      );

      const tx = new this.transactionModel({
        userId: new Types.ObjectId(userId),
        walletId: wallet._id,
        type,
        amount,
        currency,
        description,
        status: TransactionStatus.COMPLETED,
        paymentProvider: 'internal',
      });

      return tx.save({ session });
    });

    this.emitWalletEvent({
      userId,
      transactionId: savedTx._id.toString(),
      type,
      amount,
      currency,
      status: TransactionStatus.COMPLETED,
      description,
    });

    return savedTx;
  }

  async debitBalance(
    userId: string,
    amount: number,
    currency: string,
    description: string,
    type: string,
  ) {
    const savedTx = await this.withMongoTransaction(async (session) => {
      const wallet = await this.applyWalletUpdateWithRetry(
        userId,
        (currentWallet) => {
          if (currency === 'USD') {
            if (currentWallet.balanceUsd < amount) {
              throw new BadRequestException('Insufficient funds');
            }
            return {
              $inc: {
                balanceUsd: -amount,
                totalWithdrawals: type === TransactionType.WITHDRAWAL ? amount : 0,
                totalLosses: type === TransactionType.BET_PLACED ? amount : 0,
              },
            } as UpdateQuery<WalletDocument>;
          }

          if (currentWallet.balanceKsh < amount) {
            throw new BadRequestException('Insufficient funds');
          }
          return {
            $inc: {
              balanceKsh: -amount,
            },
          } as UpdateQuery<WalletDocument>;
        },
        session,
      );

      const tx = new this.transactionModel({
        userId: new Types.ObjectId(userId),
        walletId: wallet._id,
        type,
        amount,
        currency,
        description,
        status: TransactionStatus.COMPLETED,
        paymentProvider: 'internal',
      });

      return tx.save({ session });
    });

    this.emitWalletEvent({
      userId,
      transactionId: savedTx._id.toString(),
      type,
      amount,
      currency,
      status: TransactionStatus.COMPLETED,
      description,
    });

    return savedTx;
  }

  async approveWithdrawal(transactionId: string) {
    const tx = await this.withMongoTransaction(async (session) => {
      const pending = await this.transactionModel.findById(transactionId, undefined, { session });
      if (!pending || pending.type !== TransactionType.WITHDRAWAL) {
        throw new BadRequestException('Invalid withdrawal transaction');
      }

      if (pending.status === TransactionStatus.COMPLETED) {
        return pending;
      }
      if (pending.status !== TransactionStatus.PENDING && pending.status !== TransactionStatus.PROCESSING) {
        throw new BadRequestException('Withdrawal transaction is not pending');
      }

      await this.applyWalletUpdateWithRetry(
        pending.userId.toString(),
        () => {
          if (pending.currency === 'USD') {
            return {
              $inc: {
                pendingUsd: -pending.amount,
                totalWithdrawals: pending.amount,
              },
            } as UpdateQuery<WalletDocument>;
          }
          return {
            $inc: {
              pendingKsh: -pending.amount,
              totalWithdrawals: pending.amount,
            },
          } as UpdateQuery<WalletDocument>;
        },
        session,
      );

      pending.status = TransactionStatus.COMPLETED;
      await pending.save({ session });
      return pending;
    });

    this.emitWalletEvent({
      userId: tx.userId.toString(),
      transactionId: tx._id.toString(),
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      description: tx.description,
    });

    return tx;
  }

  async rejectWithdrawal(transactionId: string) {
    const tx = await this.withMongoTransaction(async (session) => {
      const pending = await this.transactionModel.findById(transactionId, undefined, { session });
      if (!pending || pending.type !== TransactionType.WITHDRAWAL) {
        throw new BadRequestException('Invalid withdrawal transaction');
      }

      if (pending.status === TransactionStatus.FAILED) {
        return pending;
      }
      if (pending.status !== TransactionStatus.PENDING && pending.status !== TransactionStatus.PROCESSING) {
        throw new BadRequestException('Withdrawal transaction is not pending');
      }

      await this.applyWalletUpdateWithRetry(
        pending.userId.toString(),
        () => {
          if (pending.currency === 'USD') {
            return {
              $inc: {
                pendingUsd: -pending.amount,
                balanceUsd: pending.amount,
              },
            } as UpdateQuery<WalletDocument>;
          }
          return {
            $inc: {
              pendingKsh: -pending.amount,
              balanceKsh: pending.amount,
            },
          } as UpdateQuery<WalletDocument>;
        },
        session,
      );

      pending.status = TransactionStatus.FAILED;
      await pending.save({ session });
      return pending;
    });

    this.emitWalletEvent({
      userId: tx.userId.toString(),
      transactionId: tx._id.toString(),
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      description: tx.description,
    });

    return tx;
  }

  async findProviderTransaction(provider: string, externalTransactionId: string) {
    return this.transactionModel.findOne({
      paymentProvider: provider,
      externalTransactionId,
    });
  }

  async reservePendingWithdrawalForProvider(params: {
    userId: string;
    amount: number;
    currency: string;
    provider: string;
    paymentMetadata?: Record<string, unknown>;
  }) {
    const transaction = await this.transactionModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(params.userId),
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        amount: params.amount,
        currency: params.currency,
      },
      {
        $set: {
          status: TransactionStatus.PROCESSING,
          paymentProvider: params.provider,
          paymentMetadata: params.paymentMetadata || {},
        },
      },
      { new: true, sort: { createdAt: 1 } },
    );

    if (!transaction) {
      throw new NotFoundException('No pending withdrawal transaction available');
    }

    return transaction;
  }

  async getTransactionById(transactionId: string) {
    if (!Types.ObjectId.isValid(transactionId)) {
      return null;
    }
    return this.transactionModel.findById(transactionId);
  }

  async reconcilePendingTransactions(maxAgeMinutes = 30) {
    const threshold = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const staleTransactions = await this.transactionModel
      .find({
        status: { $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
        createdAt: { $lt: threshold },
      })
      .limit(200)
      .exec();

    let failedCount = 0;
    for (const tx of staleTransactions) {
      try {
        await this.failPendingTransaction(
          tx._id.toString(),
          'stale_pending_timeout',
          {
            paymentMetadata: {
              reconciledAt: new Date().toISOString(),
            },
          },
        );
        failedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Reconciliation failed for tx ${tx._id.toString()}: ${message}`);
      }
    }

    return { scanned: staleTransactions.length, failed: failedCount };
  }

  private async withMongoTransaction<T>(work: (session: ClientSession) => Promise<T>) {
    const session = await this.connection.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  private async getOrCreateWallet(userId: string, session?: ClientSession) {
    const userObjectId = new Types.ObjectId(userId);
    let wallet = await this.walletModel.findOne({ userId: userObjectId }, undefined, { session });
    if (!wallet) {
      wallet = await this.createWallet(userId, session);
    }
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  private async applyWalletUpdateWithRetry(
    userId: string,
    updateFactory: (wallet: WalletDocument) => UpdateQuery<WalletDocument>,
    session?: ClientSession,
  ) {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const wallet = await this.getOrCreateWallet(userId, session);
      const update = updateFactory(wallet);
      const updated = await this.walletModel.findOneAndUpdate(
        { _id: wallet._id, version: wallet.version },
        {
          ...update,
          $inc: {
            ...(update.$inc || {}),
            version: 1,
          },
        },
        { new: true, session },
      );

      if (updated) {
        return updated;
      }
    }

    throw new BadRequestException('Wallet update conflict, please retry');
  }

  private async checkDailyLimit(
    userId: string,
    amount: number,
    type: LimitType,
    currency: string,
    session?: ClientSession,
  ) {
    const userTier = await this.getUserTier(userId, session);
    const limits = DAILY_LIMITS[userTier] || DAILY_LIMITS[UserTier.NOVICE];
    const today = new Date().toISOString().split('T')[0];
    const userObjectId = new Types.ObjectId(userId);

    const limitKey = type === 'deposit' ? 'deposit' : 'withdrawal';
    const usedKey: LimitUsageField =
      currency === 'KSH'
        ? type === 'deposit'
          ? 'depositUsedKsh'
          : 'withdrawalUsedKsh'
        : type === 'deposit'
          ? 'depositUsedUsd'
          : 'withdrawalUsedUsd';

    const maxAllowed = limits[limitKey];

    let record = await this.dailyLimitModel.findOne(
      { userId: userObjectId, date: today },
      undefined,
      { session },
    );
    if (!record) {
      record = new this.dailyLimitModel({
        userId: userObjectId,
        date: today,
      });
    }

    const currentUsed = Number(record.get(usedKey) || 0);
    if (currentUsed + amount > maxAllowed) {
      throw new BadRequestException(`Daily ${type} limit exceeded. Limit: ${maxAllowed}`);
    }

    record.set(usedKey, currentUsed + amount);
    await record.save({ session });
  }

  private async getUserTier(userId: string, session?: ClientSession) {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId), 'tier', { session })
      .lean()
      .exec();
    const tier = (user?.tier as UserTier | undefined) || UserTier.NOVICE;
    return tier in DAILY_LIMITS ? tier : UserTier.NOVICE;
  }

  private validateTronAddress(address: string) {
    const trc20Pattern = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
    if (!trc20Pattern.test(address)) {
      throw new BadRequestException('Invalid USDT TRC20 withdrawal address');
    }
  }

  private emitWalletEvent(payload: {
    userId: string;
    transactionId: string;
    type: string;
    amount: number;
    currency: string;
    status: string;
    description: string;
  }) {
    this.kafkaClient.emit(
      'wallet.transactions',
      new WalletTransactionEvent({
        userId: payload.userId,
        transactionId: payload.transactionId,
        type: payload.type,
        amount: payload.amount,
        currency: payload.currency,
        status: payload.status,
        description: payload.description,
      }),
    );
  }
}
