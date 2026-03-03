import {
  Injectable,
  NotFoundException,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  User,
  UserDocument,
  Wallet,
  WalletDocument,
  Market,
  MarketDocument,
  Transaction,
  TransactionDocument,
  ComplianceFlag,
  ComplianceFlagDocument,
  AuditLog,
  AuditLogDocument,
  FlagStatus,
  FlagReason,
  RecurringMarketTemplate,
  RecurringMarketTemplateDocument,
  Blog,
  BlogDocument,
  NewsletterSubscriber,
  NewsletterSubscriberDocument,
  LandingPage,
  LandingPageDocument,
} from '@app/database';
import { TransactionType, TransactionStatus, KAFKA_TOPICS } from '@app/common';
import { ClientKafka, ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { ComplianceFlagEvent } from '@app/kafka';

type MaintenanceTaskId =
  | 'integrity-check'
  | 'fix-threshold'
  | 'reconciliation'
  | 'health-check'
  | 'audit-chain'
  | 'backup';

type MaintenanceTaskDescriptor = {
  id: MaintenanceTaskId;
  title: string;
  description: string;
  destructive: boolean;
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly systemActorId = new Types.ObjectId('000000000000000000000000');
  private readonly maintenanceTasks: MaintenanceTaskDescriptor[] = [
    {
      id: 'integrity-check',
      title: 'Data Integrity Check',
      description: 'Scan for market outcome and participant consistency anomalies.',
      destructive: false,
    },
    {
      id: 'fix-threshold',
      title: 'Fix Sub-Threshold Markets',
      description: 'Cancel settled markets that did not meet minimum participation.',
      destructive: true,
    },
    {
      id: 'reconciliation',
      title: 'Financial Reconciliation',
      description: 'Compare wallet balances with transaction ledger snapshots.',
      destructive: false,
    },
    {
      id: 'health-check',
      title: 'Data Health Check',
      description: 'Run combined integrity, audit-chain, and payment staleness checks.',
      destructive: false,
    },
    {
      id: 'audit-chain',
      title: 'Verify Audit Chain',
      description: 'Validate audit sequence continuity and timestamp ordering.',
      destructive: false,
    },
    {
      id: 'backup',
      title: 'Export Backup',
      description: 'Create a JSON snapshot of critical entities and admin logs.',
      destructive: false,
    },
  ];

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(ComplianceFlag.name) private complianceFlagModel: Model<ComplianceFlagDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(RecurringMarketTemplate.name)
    private recurringMarketTemplateModel: Model<RecurringMarketTemplateDocument>,
    @InjectModel(Blog.name) private blogModel: Model<BlogDocument>,
    @InjectModel(NewsletterSubscriber.name)
    private newsletterSubscriberModel: Model<NewsletterSubscriberDocument>,
    @InjectModel(LandingPage.name) private landingPageModel: Model<LandingPageDocument>,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
    @Inject('WALLET_SERVICE') private readonly walletClient: ClientProxy,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // USER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  async getUsers(
    limit = 20,
    offset = 0,
    search?: string,
    role?: string,
    tier?: string,
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const filter: Record<string, any> = {};
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ email: regex }, { username: regex }, { fullName: regex }];
    }
    if (role) filter.role = role;
    if (tier) filter.tier = tier;

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-passwordHash -twoFactorSecret -backupCodes')
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .exec(),
      this.userModel.countDocuments(filter),
    ]);

    return { data: users, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  async getUserById(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel
      .findById(userId)
      .select('-passwordHash -twoFactorSecret -backupCodes')
      .exec();
    
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async deleteUser(userId: string, adminId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    try {
      const user = await this.userModel.findById(userId).exec();
      if (!user) throw new NotFoundException('User not found');

      const suffix = user._id.toString().slice(-8);
      
      // Anonymize user data
      user.email = `deleted+${suffix}@deleted.local`;
      user.username = `deleted_${suffix}`;
      user.fullName = undefined;
      user.phone = undefined;
      user.location = undefined;
      user.bio = undefined;
      user.avatarUrl = undefined;
      user.refreshTokenHash = undefined;
      user.refreshTokenExpiresAt = undefined;
      user.isBanned = true;
      user.banReason = 'Deleted by admin';
      user.isFlagged = false;

      await user.save();
      await this.logAudit('DELETE_USER', userId, { adminId, entityType: 'user' });

      return { success: true, userId };
    } catch (error: any) {
      this.logger.error(`Error deleting user ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async banUser(userId: string, reason?: string, adminId?: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    try {
      const user = await this.userModel.findByIdAndUpdate(
        userId,
        {
          isBanned: true,
          banReason: reason || 'Banned by admin',
        },
        { new: true },
      ).exec();
      
      if (!user) throw new NotFoundException('User not found');
      
      await this.logAudit('BAN_USER', userId, { 
        adminId: adminId || this.systemActorId.toString(), 
        entityType: 'user', 
        reason 
      });
      
      return { success: true, userId };
    } catch (error: any) {
      this.logger.error(`Error banning user ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async unbanUser(userId: string, adminId?: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    try {
      const user = await this.userModel.findByIdAndUpdate(
        userId, 
        {
          isBanned: false,
          banReason: null,
        },
        { new: true }
      ).exec();
      
      if (!user) throw new NotFoundException('User not found');

      await this.logAudit('UNBAN_USER', userId, { adminId, entityType: 'user' });
      return { success: true, userId };
    } catch (error: any) {
      this.logger.error(`Error unbanning user ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateUserTier(userId: string, tier: string, adminId?: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    // Validate tier value
    const validTiers = ['novice', 'high_roller', 'whale', 'legend'];
    if (!validTiers.includes(tier)) {
      throw new BadRequestException('Invalid tier value');
    }

    try {
      const user = await this.userModel.findByIdAndUpdate(
        userId, 
        { tier }, 
        { new: true }
      ).exec();
      
      if (!user) throw new NotFoundException('User not found');

      await this.logAudit('TIER_UPDATE', userId, { adminId, newTier: tier, entityType: 'user' });
      return { success: true, tier: user.tier };
    } catch (error: any) {
      this.logger.error(`Error updating user tier for ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COMPLIANCE & FLAGS
  // ═══════════════════════════════════════════════════════════════════════

  async getComplianceFlags(status?: string, limit = 20, offset = 0) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const filter: Record<string, any> = {};
    
    if (status) {
      // Validate status
      const validStatuses = Object.values(FlagStatus);
      if (validStatuses.includes(status as FlagStatus)) {
        filter.status = status;
      }
    }

    const [flags, total] = await Promise.all([
      this.complianceFlagModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .populate('userId', 'username email')
        .exec(),
      this.complianceFlagModel.countDocuments(filter),
    ]);

    return { data: flags, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  async freezeAccount(userId: string, reason: string, adminId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Reason is required');
    }

    try {
      const user = await this.userModel.findById(userId).exec();
      if (!user) throw new NotFoundException('User not found');

      user.tier = 'restricted';
      user.isBanned = true;
      user.banReason = `Account Frozen: ${reason}`;
      await user.save();

      // Emit event
      await lastValueFrom(
        this.kafkaClient.emit(KAFKA_TOPICS.COMPLIANCE_FLAGS, {
          type: 'ACCOUNT_FROZEN',
          payload: {
            userId,
            flagId: `FREEZE-${userId}-${Date.now()}`,
            reason,
            action: 'ACCOUNT_FROZEN',
            description: `Account frozen: ${reason}`,
            triggeredBy: adminId,
            metadata: { timestamp: new Date() },
          },
        } as ComplianceFlagEvent),
      );

      await this.logAudit('FREEZE_ACCOUNT', userId, { adminId, reason, entityType: 'user' });

      return { success: true, userId };
    } catch (error: any) {
      this.logger.error(`Error freezing account ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async unfreezeAccount(userId: string, adminId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    try {
      const user = await this.userModel.findById(userId).exec();
      if (!user) throw new NotFoundException('User not found');

      // Restore to default tier instead of hardcoded 'registered'
      user.tier = 'novice';
      user.isBanned = false;
      user.banReason = undefined;
      await user.save();

      await lastValueFrom(
        this.kafkaClient.emit(KAFKA_TOPICS.COMPLIANCE_FLAGS, {
          type: 'ACCOUNT_UNFROZEN',
          payload: {
            userId,
            flagId: `UNFREEZE-${userId}-${Date.now()}`,
            reason: 'Manual unfreeze by admin',
            action: 'ACCOUNT_UNFROZEN',
            description: 'Account unfrozen by admin',
            triggeredBy: adminId,
            metadata: { timestamp: new Date() },
          },
        } as ComplianceFlagEvent),
      );

      await this.logAudit('UNFREEZE_ACCOUNT', userId, { adminId, entityType: 'user' });

      return { success: true, userId };
    } catch (error: any) {
      this.logger.error(`Error unfreezing account ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async resolveComplianceFlag(flagId: string, notes: string | undefined, adminId: string) {
    if (!Types.ObjectId.isValid(flagId)) {
      throw new BadRequestException('Invalid flag ID format');
    }

    try {
      const flag = await this.complianceFlagModel.findById(flagId).exec();
      if (!flag) throw new NotFoundException('Compliance flag not found');

      flag.status = FlagStatus.RESOLVED;
      flag.reviewedBy = this.parseObjectId(adminId) || this.systemActorId;
      
      if (notes && notes.trim()) {
        flag.reviewNotes = notes.trim();
      }
      
      flag.resolvedAt = new Date();
      await flag.save();

      // Check if user has other open flags
      const remainingOpenFlags = await this.complianceFlagModel.countDocuments({
        userId: flag.userId,
        status: { $in: [FlagStatus.OPEN, FlagStatus.INVESTIGATING] },
        _id: { $ne: flag._id },
      });

      // Only unflag if no remaining open flags
      if (remainingOpenFlags === 0) {
        await this.userModel.findByIdAndUpdate(flag.userId, { isFlagged: false }).exec();
      }

      await this.logAudit('RESOLVE_COMPLIANCE_FLAG', flag.userId.toString(), {
        adminId,
        flagId,
        notes: notes || null,
        entityType: 'compliance_flag',
      });

      return flag;
    } catch (error: any) {
      this.logger.error(`Error resolving compliance flag ${flagId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async escalateComplianceFlag(flagId: string, notes: string | undefined, adminId: string) {
    if (!Types.ObjectId.isValid(flagId)) {
      throw new BadRequestException('Invalid flag ID format');
    }

    try {
      const flag = await this.complianceFlagModel.findById(flagId).exec();
      if (!flag) throw new NotFoundException('Compliance flag not found');

      flag.status = FlagStatus.INVESTIGATING;
      flag.reviewedBy = this.parseObjectId(adminId) || this.systemActorId;
      
      if (notes && notes.trim()) {
        const timestamp = new Date().toISOString();
        // Append to reviewNotes field (not 'notes')
        flag.reviewNotes = (flag.reviewNotes || '') + `\n\n[${timestamp}] [ESCALATED BY ADMIN]: ${notes}`;
      }
      
      await flag.save();

      // Flag the user account
      await this.userModel.findByIdAndUpdate(flag.userId, { isFlagged: true }).exec();

      await this.logAudit('ESCALATE_COMPLIANCE_FLAG', flag.userId.toString(), {
        adminId,
        flagId,
        notes: notes || null,
        entityType: 'compliance_flag',
      });

      return flag;
    } catch (error: any) {
      this.logger.error(`Error escalating compliance flag ${flagId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async addComplianceFlagNote(flagId: string, note: string, adminId: string) {
    if (!Types.ObjectId.isValid(flagId)) {
      throw new BadRequestException('Invalid flag ID format');
    }

    const trimmedNote = note?.trim();
    if (!trimmedNote) {
      throw new BadRequestException('Note is required');
    }

    try {
      const flag = await this.complianceFlagModel.findById(flagId).exec();
      if (!flag) throw new NotFoundException('Compliance flag not found');

      const timestamp = new Date().toISOString();
      const nextNotes = flag.reviewNotes
        ? `${flag.reviewNotes}\n[${timestamp}] ${trimmedNote}`
        : `[${timestamp}] ${trimmedNote}`;

      flag.reviewNotes = nextNotes;
      flag.reviewedBy = this.parseObjectId(adminId) || this.systemActorId;
      await flag.save();

      await this.logAudit('ADD_COMPLIANCE_FLAG_NOTE', flag.userId.toString(), {
        adminId,
        flagId,
        note: trimmedNote,
        entityType: 'compliance_flag',
      });

      return flag;
    } catch (error: any) {
      this.logger.error(`Error adding compliance flag note for ${flagId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WITHDRAWALS
  // ═══════════════════════════════════════════════════════════════════════

  async getPendingWithdrawals(limit = 20, offset = 0) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    
    const filter = {
      type: TransactionType.WITHDRAWAL,
      status: TransactionStatus.PENDING,
    };

    const [withdrawals, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .populate('userId', 'username email')
        .exec(),
      this.transactionModel.countDocuments(filter),
    ]);

    return { data: withdrawals, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  async approveWithdrawal(transactionId: string, adminId: string) {
    if (!Types.ObjectId.isValid(transactionId)) {
      throw new BadRequestException('Invalid transaction ID format');
    }

    try {
      const rpcResult = await lastValueFrom(
        this.walletClient.send('approve_withdrawal', { transactionId }),
      );

      if (!rpcResult?.success) {
        throw new BadRequestException(rpcResult?.error || 'Failed to approve withdrawal');
      }

      const tx = rpcResult.data;
      const userId = tx?.userId?.toString?.() || tx?.userId || '';
      
      await this.logAudit('APPROVE_WITHDRAWAL', userId, {
        transactionId,
        amount: tx?.amount,
        currency: tx?.currency,
        adminId,
        entityType: 'transaction',
      });
      
      return tx;
    } catch (error: any) {
      this.logger.error(`Error approving withdrawal ${transactionId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async rejectWithdrawal(transactionId: string, reason: string, adminId: string) {
    if (!Types.ObjectId.isValid(transactionId)) {
      throw new BadRequestException('Invalid transaction ID format');
    }

    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Rejection reason is required');
    }

    try {
      const rpcResult = await lastValueFrom(
        this.walletClient.send('reject_withdrawal', { transactionId, reason }),
      );

      if (!rpcResult?.success) {
        throw new BadRequestException(rpcResult?.error || 'Failed to reject withdrawal');
      }

      const tx = rpcResult.data;
      const userId = tx?.userId?.toString?.() || tx?.userId || '';
      
      await this.logAudit('REJECT_WITHDRAWAL', userId, {
        transactionId,
        reason,
        amount: tx?.amount,
        currency: tx?.currency,
        adminId,
        entityType: 'transaction',
      });
      
      return tx;
    } catch (error: any) {
      this.logger.error(`Error rejecting withdrawal ${transactionId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RECURRING MARKETS
  // ═══════════════════════════════════════════════════════════════════════

  async getRecurringMarketTemplates(limit = 20, offset = 0) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const [templates, total] = await Promise.all([
      this.recurringMarketTemplateModel
        .find()
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.recurringMarketTemplateModel.countDocuments(),
    ]);

    return { data: templates, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  async createRecurringMarketTemplate(payload: Record<string, any>, adminId: string) {
    try {
      // Validate and normalize options
      const options = Array.isArray(payload.options)
        ? payload.options
            .map((option) => String(option || '').trim())
            .filter((option) => option.length > 0)
        : [];
      
      if (options.length < 2) {
        throw new BadRequestException('At least two options are required');
      }

      // Validate startDate
      const startDate = payload.startDate ? new Date(payload.startDate) : new Date();
      if (Number.isNaN(startDate.getTime())) {
        throw new BadRequestException('Invalid startDate');
      }

      const recurrence = this.normalizeRecurrence(payload.recurrence);
      const cronExpression = payload.cronExpression ? String(payload.cronExpression).trim() : undefined;

      const titleTemplate = String(
        payload.titleTemplate || payload.marketTitle || payload.title || ''
      ).trim();
      
      if (!titleTemplate) {
        throw new BadRequestException('titleTemplate is required');
      }

      const template = new this.recurringMarketTemplateModel({
        name: String(payload.name || payload.templateName || 'Recurring Market').trim(),
        titleTemplate,
        description: String(payload.description || '').trim(),
        marketType: this.normalizeMarketType(payload.marketType || payload.type),
        options,
        tags: Array.isArray(payload.tags)
          ? payload.tags
              .map((tag: unknown) => String(tag || '').trim())
              .filter((tag: string) => tag.length > 0)
          : [],
        recurrence,
        cronExpression,
        timezone: String(payload.timezone || 'UTC').trim() || 'UTC',
        startDate,
        openTime: String(payload.openTime || '09:00'),
        closeTime: String(payload.closeTime || '17:00'),
        buyInAmount: Math.max(Number(payload.buyInAmount || payload.minStake || 0), 0),
        settlementDelayHours: Math.max(Number(payload.settlementDelayHours || 2), 0),
        autoPublish: payload.autoPublish !== false,
        isPaused: Boolean(payload.isPaused),
        createdBy: this.parseObjectId(adminId) || this.systemActorId,
      });

      template.nextExecutionAt = template.isPaused
        ? undefined
        : this.computeNextExecutionAt(template.startDate, template.recurrence, cronExpression);

      await template.save();
      
      await this.logAudit('CREATE_RECURRING_MARKET_TEMPLATE', template._id.toString(), {
        adminId,
        entityType: 'recurring_market',
        recurrence: template.recurrence,
        marketType: template.marketType,
      });

      return template;
    } catch (error: any) {
      this.logger.error(`Error creating recurring market template: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateRecurringMarketTemplate(
    templateId: string,
    updates: Record<string, any>,
    adminId: string,
  ) {
    if (!Types.ObjectId.isValid(templateId)) {
      throw new BadRequestException('Invalid template ID format');
    }

    try {
      const template = await this.recurringMarketTemplateModel.findById(templateId).exec();
      if (!template) throw new NotFoundException('Recurring market template not found');

      // Update fields conditionally
      if (updates.name !== undefined) {
        template.name = String(updates.name || '').trim();
      }
      if (updates.titleTemplate !== undefined) {
        const titleTemplate = String(updates.titleTemplate || '').trim();
        if (!titleTemplate) {
          throw new BadRequestException('titleTemplate cannot be empty');
        }
        template.titleTemplate = titleTemplate;
      }
      if (updates.description !== undefined) {
        template.description = String(updates.description || '').trim();
      }
      if (updates.marketType !== undefined || updates.type !== undefined) {
        template.marketType = this.normalizeMarketType(updates.marketType || updates.type);
      }
      if (updates.options !== undefined) {
        const options = Array.isArray(updates.options)
          ? updates.options
              .map((option: unknown) => String(option || '').trim())
              .filter((option: string) => option.length > 0)
          : [];
        if (options.length < 2) {
          throw new BadRequestException('At least two options are required');
        }
        template.options = options;
      }
      if (updates.tags !== undefined) {
        template.tags = Array.isArray(updates.tags)
          ? updates.tags
              .map((tag: unknown) => String(tag || '').trim())
              .filter((tag: string) => tag.length > 0)
          : [];
      }
      if (updates.recurrence !== undefined) {
        template.recurrence = this.normalizeRecurrence(updates.recurrence);
      }
      if (updates.cronExpression !== undefined) {
        template.cronExpression = updates.cronExpression
          ? String(updates.cronExpression).trim()
          : undefined;
      }
      if (updates.timezone !== undefined) {
        template.timezone = String(updates.timezone || 'UTC').trim() || 'UTC';
      }
      if (updates.startDate !== undefined) {
        const startDate = new Date(updates.startDate);
        if (Number.isNaN(startDate.getTime())) {
          throw new BadRequestException('Invalid startDate');
        }
        template.startDate = startDate;
      }
      if (updates.openTime !== undefined) {
        template.openTime = String(updates.openTime || '09:00');
      }
      if (updates.closeTime !== undefined) {
        template.closeTime = String(updates.closeTime || '17:00');
      }
      if (updates.buyInAmount !== undefined || updates.minStake !== undefined) {
        template.buyInAmount = Math.max(Number(updates.buyInAmount ?? updates.minStake ?? 0), 0);
      }
      if (updates.settlementDelayHours !== undefined) {
        template.settlementDelayHours = Math.max(Number(updates.settlementDelayHours), 0);
      }
      if (updates.autoPublish !== undefined) {
        template.autoPublish = Boolean(updates.autoPublish);
      }
      if (updates.isPaused !== undefined) {
        template.isPaused = Boolean(updates.isPaused);
      }

      // Recompute nextExecutionAt
      template.nextExecutionAt = template.isPaused
        ? undefined
        : this.computeNextExecutionAt(
            template.startDate,
            template.recurrence,
            template.cronExpression,
          );

      await template.save();
      
      await this.logAudit('UPDATE_RECURRING_MARKET_TEMPLATE', templateId, {
        adminId,
        entityType: 'recurring_market',
        updates: Object.keys(updates),
      });

      return template;
    } catch (error: any) {
      this.logger.error(`Error updating recurring market template ${templateId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteRecurringMarketTemplate(templateId: string, adminId: string) {
    if (!Types.ObjectId.isValid(templateId)) {
      throw new BadRequestException('Invalid template ID format');
    }

    try {
      const deleted = await this.recurringMarketTemplateModel.findByIdAndDelete(templateId).exec();
      if (!deleted) throw new NotFoundException('Recurring market template not found');

      await this.logAudit('DELETE_RECURRING_MARKET_TEMPLATE', templateId, {
        adminId,
        entityType: 'recurring_market',
      });
      
      return { success: true, id: templateId };
    } catch (error: any) {
      this.logger.error(`Error deleting recurring market template ${templateId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AUDIT LOGS
  // ═══════════════════════════════════════════════════════════════════════

  async getAuditLogs(limit = 20, offset = 0, action?: string) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const filter: Record<string, any> = {};
    if (action) filter.action = action;

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ sequenceNumber: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.auditLogModel.countDocuments(filter),
    ]);

    return { data: logs, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MAINTENANCE TASKS
  // ═══════════════════════════════════════════════════════════════════════

  async getMaintenanceTasks() {
    const latestRuns = await this.auditLogModel
      .find({ action: 'RUN_MAINTENANCE_TASK' })
      .sort({ sequenceNumber: -1 })
      .limit(250)
      .select('timestamp metadata')
      .lean()
      .exec();

    const runMap = new Map<string, { timestamp: Date; status: string }>();
    
    for (const run of latestRuns) {
      const metadata = (run?.metadata || {}) as Record<string, unknown>;
      const taskId = typeof metadata.taskId === 'string' ? metadata.taskId : '';
      if (!taskId || runMap.has(taskId)) continue;
      
      runMap.set(taskId, {
        timestamp: run.timestamp,
        status: typeof metadata.status === 'string' ? metadata.status : 'completed',
      });
    }

    return {
      data: this.maintenanceTasks.map((task) => ({
        ...task,
        lastRun: runMap.get(task.id) || null,
      })),
    };
  }

  async runMaintenanceTask(taskId: string, adminId: string) {
    const task = this.maintenanceTasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundException(`Maintenance task ${taskId} not found`);

    this.logger.log(`Running maintenance task: ${task.title} (by admin ${adminId})`);

    try {
      let result: any;
      
      switch (taskId) {
        case 'integrity-check':
          result = await this.runIntegrityCheck();
          break;
        case 'reconciliation':
          result = await this.runFinancialReconciliation();
          break;
        case 'health-check':
          result = await this.runHealthCheck();
          break;
        case 'fix-threshold':
          result = await this.runThresholdRepair();
          break;
        case 'audit-chain':
          result = await this.runAuditChainCheck();
          break;
        case 'backup':
          result = await this.runBackupExport();
          break;
        default:
          throw new BadRequestException(`No implementation for task ${taskId}`);
      }

      await this.logAudit('RUN_MAINTENANCE_TASK', taskId, {
        adminId,
        taskId,
        taskTitle: task.title,
        destructive: task.destructive,
        status: 'completed',
        result: this.summarizeMaintenanceResult(result),
      });

      return { success: true, result };
    } catch (error: any) {
      this.logger.error(`Error running maintenance task ${taskId}: ${error.message}`, error.stack);
      
      await this.logAudit('RUN_MAINTENANCE_TASK', taskId, {
        adminId,
        taskId,
        taskTitle: task.title,
        status: 'failed',
        error: error.message,
      });
      
      throw error;
    }
  }

  private async runIntegrityCheck() {
    const markets = await this.marketModel
      .find({ isDeleted: { $ne: true } })
      .select('_id title status minParticipants participantCount outcomes startTime closeTime')
      .lean()
      .exec();

    const participantMismatches: Array<{
      marketId: string;
      title: string;
      participantCount: number;
      outcomesParticipantCount: number;
    }> = [];

    let invalidOutcomeConfig = 0;
    let invalidTimeline = 0;

    for (const market of markets) {
      const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
      const outcomesParticipantCount = outcomes.reduce((sum, outcome: any) => {
        const participantCount = Number(outcome?.participantCount || 0);
        return sum + (Number.isFinite(participantCount) ? participantCount : 0);
      }, 0);

      const participantCount = Number(market.participantCount || 0);
      if (participantCount !== outcomesParticipantCount) {
        participantMismatches.push({
          marketId: market._id.toString(),
          title: market.title,
          participantCount,
          outcomesParticipantCount,
        });
      }

      if (outcomes.length < 2) {
        invalidOutcomeConfig += 1;
      }

      if (
        market.startTime &&
        market.closeTime &&
        new Date(market.closeTime).getTime() <= new Date(market.startTime).getTime()
      ) {
        invalidTimeline += 1;
      }
    }

    return {
      scannedMarkets: markets.length,
      participantMismatchCount: participantMismatches.length,
      invalidOutcomeConfigCount: invalidOutcomeConfig,
      invalidTimelineCount: invalidTimeline,
      sampleMismatches: participantMismatches.slice(0, 25),
    };
  }

  private async runThresholdRepair() {
    const settledMarkets = await this.marketModel
      .find({
        isDeleted: { $ne: true },
        status: { $in: ['settled', 'settling'] },
      })
      .select('_id title status participantCount minParticipants')
      .lean()
      .exec();

    const invalidMarkets = settledMarkets.filter((market) => {
      const participantCount = Number(market.participantCount || 0);
      const minParticipants = Number(market.minParticipants || 2);
      return participantCount < minParticipants;
    });

    if (invalidMarkets.length === 0) {
      return {
        scannedSettledMarkets: settledMarkets.length,
        repairedMarkets: 0,
        repairedMarketIds: [] as string[],
      };
    }

    const repairIds = invalidMarkets.map((market) => market._id);
    const updateResult = await this.marketModel.updateMany(
      { _id: { $in: repairIds } },
      {
        $set: {
          status: 'cancelled',
          complianceHold: true,
          holdReason: 'Cancelled by maintenance: settled below min participant threshold',
          payoutProcessed: false,
          updatedAt: new Date(),
        },
        $unset: {
          winningOutcomeId: '',
        },
      },
    );

    return {
      scannedSettledMarkets: settledMarkets.length,
      repairedMarkets: updateResult.modifiedCount,
      repairedMarketIds: invalidMarkets.map((market) => market._id.toString()),
    };
  }

  private async runFinancialReconciliation() {
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [walletTotalsRaw, transactionTotalsRaw, stalePendingTransactions] = await Promise.all([
      this.walletModel.aggregate([
        {
          $group: {
            _id: null,
            wallets: { $sum: 1 },
            balanceUsd: { $sum: '$balanceUsd' },
            balanceKsh: { $sum: '$balanceKsh' },
            pendingUsd: { $sum: '$pendingUsd' },
            pendingKsh: { $sum: '$pendingKsh' },
          },
        },
      ]),
      this.transactionModel.aggregate([
        { $match: { status: TransactionStatus.COMPLETED } },
        {
          $group: {
            _id: { currency: '$currency', type: '$type' },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.transactionModel.countDocuments({
        status: { $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
        createdAt: { $lt: staleThreshold },
      }),
    ]);

    const walletTotals = walletTotalsRaw[0] || {
      wallets: 0,
      balanceUsd: 0,
      balanceKsh: 0,
      pendingUsd: 0,
      pendingKsh: 0,
    };

    const ledgerByCurrency: Record<string, { credits: number; debits: number; net: number }> = {};
    const completedTransactionsByType: Record<string, { count: number; amount: number }> = {};

    for (const row of transactionTotalsRaw) {
      const currency = String(row?._id?.currency || 'USD');
      const type = String(row?._id?.type || 'unknown');
      const amount = Number(row?.totalAmount || 0);
      const count = Number(row?.count || 0);

      completedTransactionsByType[`${currency}:${type}`] = { count, amount };

      if (!ledgerByCurrency[currency]) {
        ledgerByCurrency[currency] = { credits: 0, debits: 0, net: 0 };
      }

      if (
        type === TransactionType.DEPOSIT ||
        type === TransactionType.BET_PAYOUT ||
        type === TransactionType.REFUND
      ) {
        ledgerByCurrency[currency].credits += amount;
      } else {
        ledgerByCurrency[currency].debits += amount;
      }
      
      ledgerByCurrency[currency].net =
        ledgerByCurrency[currency].credits - ledgerByCurrency[currency].debits;
    }

    return {
      walletTotals,
      ledgerByCurrency,
      completedTransactionsByType,
      stalePendingTransactions,
    };
  }

  private async runHealthCheck() {
    const [integrity, auditChain, openComplianceFlags, stalePendingTransactions] = await Promise.all([
      this.runIntegrityCheck(),
      this.runAuditChainCheck(),
      this.complianceFlagModel.countDocuments({
        status: { $in: [FlagStatus.OPEN, FlagStatus.INVESTIGATING] },
      }),
      this.transactionModel.countDocuments({
        status: { $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
        createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    const isHealthy =
      integrity.participantMismatchCount === 0 &&
      integrity.invalidOutcomeConfigCount === 0 &&
      integrity.invalidTimelineCount === 0 &&
      auditChain.gapCount === 0 &&
      auditChain.outOfOrderTimestamps === 0 &&
      stalePendingTransactions === 0;

    return {
      isHealthy,
      openComplianceFlags,
      stalePendingTransactions,
      integrity,
      auditChain,
    };
  }

  private async runAuditChainCheck() {
    const logs = await this.auditLogModel
      .find()
      .sort({ sequenceNumber: 1 })
      .select('sequenceNumber timestamp')
      .limit(20000)
      .lean()
      .exec();

    if (logs.length === 0) {
      return {
        totalLogs: 0,
        firstSequence: null,
        lastSequence: null,
        gapCount: 0,
        outOfOrderTimestamps: 0,
        sampleGaps: [] as Array<{ expected: number; actual: number }>,
      };
    }

    const gaps: Array<{ expected: number; actual: number }> = [];
    let outOfOrderTimestamps = 0;

    for (let i = 1; i < logs.length; i += 1) {
      const previous = logs[i - 1];
      const current = logs[i];
      const expected = Number(previous.sequenceNumber || 0) + 1;
      const actual = Number(current.sequenceNumber || 0);
      
      if (actual !== expected) {
        gaps.push({ expected, actual });
      }

      const previousTs = new Date(previous.timestamp).getTime();
      const currentTs = new Date(current.timestamp).getTime();
      
      if (Number.isFinite(previousTs) && Number.isFinite(currentTs) && currentTs < previousTs) {
        outOfOrderTimestamps += 1;
      }
    }

    return {
      totalLogs: logs.length,
      firstSequence: logs[0].sequenceNumber,
      lastSequence: logs[logs.length - 1].sequenceNumber,
      gapCount: gaps.length,
      outOfOrderTimestamps,
      sampleGaps: gaps.slice(0, 25),
    };
  }

  private async runBackupExport() {
    const [users, wallets, markets, transactions, complianceFlags, auditLogs] = await Promise.all([
      this.userModel
        .find()
        .sort({ createdAt: -1 })
        .limit(250)
        .select(
          '_id email username fullName role tier reputationScore signalAccuracy isVerified isFlagged isBanned createdAt updatedAt',
        )
        .lean()
        .exec(),
      this.walletModel
        .find()
        .sort({ updatedAt: -1 })
        .limit(250)
        .select(
          '_id userId balanceUsd balanceKsh pendingUsd pendingKsh totalDeposits totalWithdrawals totalWinnings totalLosses totalVolume totalPnl version isFrozen createdAt updatedAt',
        )
        .lean()
        .exec(),
      this.marketModel
        .find({ isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(300)
        .select(
          '_id title betType status buyInAmount participantCount totalPool minParticipants closeTime settlementTime payoutProcessed complianceHold holdReason createdAt updatedAt',
        )
        .lean()
        .exec(),
      this.transactionModel
        .find()
        .sort({ createdAt: -1 })
        .limit(500)
        .select(
          '_id userId walletId type amount currency status description externalTransactionId paymentProvider paymentMetadata createdAt updatedAt',
        )
        .lean()
        .exec(),
      this.complianceFlagModel
        .find()
        .sort({ createdAt: -1 })
        .limit(300)
        .select('_id userId reason status description reviewedBy createdAt updatedAt resolvedAt')
        .lean()
        .exec(),
      this.auditLogModel
        .find()
        .sort({ sequenceNumber: -1 })
        .limit(500)
        .select(
          '_id sequenceNumber timestamp eventType actorId actorType entityType entityId action metadata verificationStatus',
        )
        .lean()
        .exec(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      counts: {
        users: users.length,
        wallets: wallets.length,
        markets: markets.length,
        transactions: transactions.length,
        complianceFlags: complianceFlags.length,
        auditLogs: auditLogs.length,
      },
      data: {
        users,
        wallets,
        markets,
        transactions,
        complianceFlags,
        auditLogs,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BLOG MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  async getBlogs(limit = 20, offset = 0, status?: string) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const filter: Record<string, any> = {};
    
    if (status) {
      const validStatuses = ['draft', 'published', 'archived'];
      if (validStatuses.includes(status)) {
        filter.status = status;
      }
    }

    const [blogs, total] = await Promise.all([
      this.blogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.blogModel.countDocuments(filter),
    ]);

    return { data: blogs, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  async getBlogById(blogId: string) {
    if (!Types.ObjectId.isValid(blogId)) {
      throw new BadRequestException('Invalid blog ID format');
    }

    const blog = await this.blogModel.findById(blogId).lean().exec();
    if (!blog) throw new NotFoundException('Blog not found');
    return blog;
  }

  async getBlogBySlug(slug: string) {
    if (!slug || slug.trim().length === 0) {
      throw new BadRequestException('Slug is required');
    }

    const blog = await this.blogModel.findOne({ slug: slug.trim() }).lean().exec();
    if (!blog) throw new NotFoundException('Blog not found');
    return blog;
  }

  async incrementBlogViews(slug: string) {
    if (!slug || slug.trim().length === 0) {
      throw new BadRequestException('Slug is required');
    }

    const blog = await this.blogModel.findOneAndUpdate(
      { slug: slug.trim() },
      { $inc: { views: 1 } },
      { new: true, select: 'views' }
    ).exec();
    
    if (!blog) throw new NotFoundException('Blog not found');
    return { success: true, views: blog.views || 0 };
  }

  async createBlog(payload: Record<string, any>, adminId: string) {
    try {
      const title = String(payload.title || '').trim();
      if (!title) {
        throw new BadRequestException('Title is required');
      }

      const slug = payload.slug
        ? String(payload.slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
        : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const existing = await this.blogModel.findOne({ slug }).exec();
      if (existing) {
        throw new BadRequestException('A blog with this slug already exists');
      }

      const status = ['draft', 'published', 'archived'].includes(payload.status) 
        ? payload.status 
        : 'draft';

      const blog = new this.blogModel({
        title,
        slug,
        content: String(payload.content || ''),
        excerpt: String(payload.excerpt || '').trim(),
        coverImage: payload.coverImage || undefined,
        author: String(payload.author || '').trim(),
        readTime: Math.max(Number(payload.readTime || 5), 1),
        tags: Array.isArray(payload.tags)
          ? payload.tags.map((t: unknown) => String(t || '').trim()).filter(Boolean)
          : [],
        status,
        views: 0,
        publishedAt: status === 'published' ? new Date() : undefined,
      });

      await blog.save();
      await this.logAudit('CREATE_BLOG', blog._id.toString(), { adminId, entityType: 'blog', title });
      
      return blog;
    } catch (error: any) {
      this.logger.error(`Error creating blog: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateBlog(blogId: string, updates: Record<string, any>, adminId: string) {
    if (!Types.ObjectId.isValid(blogId)) {
      throw new BadRequestException('Invalid blog ID format');
    }

    try {
      const blog = await this.blogModel.findById(blogId).exec();
      if (!blog) throw new NotFoundException('Blog not found');

      if (updates.title !== undefined) {
        const title = String(updates.title).trim();
        if (!title) {
          throw new BadRequestException('Title cannot be empty');
        }
        blog.title = title;
      }
      
      if (updates.slug !== undefined) {
        const slug = String(updates.slug).trim().toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/(^-|-$)/g, '');
        
        if (!slug) {
          throw new BadRequestException('Slug cannot be empty');
        }
        
        // Check if slug is already taken by another blog
        const existing = await this.blogModel.findOne({ 
          slug, 
          _id: { $ne: blogId } 
        }).exec();
        
        if (existing) {
          throw new BadRequestException('Slug already taken by another blog');
        }
        
        blog.slug = slug;
      }
      
      if (updates.content !== undefined) {
        blog.content = String(updates.content);
      }
      if (updates.excerpt !== undefined) {
        blog.excerpt = String(updates.excerpt).trim();
      }
      if (updates.coverImage !== undefined) {
        blog.coverImage = updates.coverImage || undefined;
      }
      if (updates.author !== undefined) {
        blog.author = String(updates.author).trim();
      }
      if (updates.readTime !== undefined) {
        blog.readTime = Math.max(Number(updates.readTime || 5), 1);
      }
      if (updates.tags !== undefined) {
        blog.tags = Array.isArray(updates.tags)
          ? updates.tags.map((t: unknown) => String(t || '').trim()).filter(Boolean)
          : [];
      }
      if (updates.status !== undefined) {
        const validStatuses = ['draft', 'published', 'archived'];
        if (validStatuses.includes(updates.status)) {
          blog.status = updates.status;
          
          // Set publishedAt when first published
          if (updates.status === 'published' && !blog.publishedAt) {
            blog.publishedAt = new Date();
          }
        }
      }

      await blog.save();
      await this.logAudit('UPDATE_BLOG', blogId, { adminId, entityType: 'blog', title: blog.title });
      
      return blog;
    } catch (error: any) {
      this.logger.error(`Error updating blog ${blogId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteBlog(blogId: string, adminId: string) {
    if (!Types.ObjectId.isValid(blogId)) {
      throw new BadRequestException('Invalid blog ID format');
    }

    try {
      const deleted = await this.blogModel.findByIdAndDelete(blogId).exec();
      if (!deleted) throw new NotFoundException('Blog not found');

      await this.logAudit('DELETE_BLOG', blogId, { adminId, entityType: 'blog', title: deleted.title });
      return { success: true, id: blogId };
    } catch (error: any) {
      this.logger.error(`Error deleting blog ${blogId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NEWSLETTER
  // ═══════════════════════════════════════════════════════════════════════

  async subscribeNewsletter(email: string) {
    const trimmedEmail = (email || '').trim().toLowerCase();
    
    // Basic email validation
    if (!trimmedEmail || !trimmedEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new BadRequestException('Valid email is required');
    }

    try {
      const existing = await this.newsletterSubscriberModel.findOne({ email: trimmedEmail }).exec();
      
      if (existing) {
        if (existing.status === 'unsubscribed') {
          existing.status = 'active';
          existing.subscribedAt = new Date();
          await existing.save();
          return { success: true, message: 'Re-subscribed successfully' };
        }
        return { success: true, message: 'Already subscribed' };
      }

      const subscriber = new this.newsletterSubscriberModel({
        email: trimmedEmail,
        status: 'active',
        subscribedAt: new Date(),
      });
      
      await subscriber.save();
      return { success: true, message: 'Subscribed successfully' };
    } catch (error: any) {
      this.logger.error(`Error subscribing to newsletter: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getNewsletterSubscribers(limit = 20, offset = 0, status?: string) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const filter: Record<string, any> = {};
    if (status) {
      const validStatuses = ['active', 'unsubscribed'];
      if (validStatuses.includes(status)) {
        filter.status = status;
      }
    }

    const [subscribers, total] = await Promise.all([
      this.newsletterSubscriberModel
        .find(filter)
        .sort({ subscribedAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.newsletterSubscriberModel.countDocuments(filter),
    ]);

    return { data: subscribers, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LANDING PAGE CMS
  // ═══════════════════════════════════════════════════════════════════════

  async getLandingPageSettings() {
    try {
      let settings = await this.landingPageModel.findOne({ key: 'default' }).lean().exec();
      
      if (!settings) {
        // Return sensible defaults
        return {
          key: 'default',
          hero: {},
          features: {},
          gameModes: {},
          testimonials: {},
          hallOfFame: {},
          currency: {},
          socialProofStats: {},
        };
      }
      
      return settings;
    } catch (error: any) {
      this.logger.error(`Error fetching landing page settings: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateLandingPageSettings(updates: Record<string, any>, adminId: string) {
    try {
      const allowed = [
        'hero', 
        'features', 
        'gameModes', 
        'testimonials', 
        'hallOfFame', 
        'currency', 
        'socialProofStats'
      ];
      
      const $set: Record<string, any> = {};
      for (const key of allowed) {
        if (updates[key] !== undefined) {
          $set[key] = updates[key];
        }
      }

      if (Object.keys($set).length === 0) {
        throw new BadRequestException('No valid fields to update');
      }

      const settings = await this.landingPageModel.findOneAndUpdate(
        { key: 'default' },
        { $set },
        { new: true, upsert: true },
      ).exec();

      await this.logAudit('UPDATE_LANDING_PAGE', 'landing-page', {
        adminId,
        entityType: 'content',
        updatedSections: Object.keys($set),
      });

      return settings;
    } catch (error: any) {
      this.logger.error(`Error updating landing page settings: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LEADERBOARD
  // ═══════════════════════════════════════════════════════════════════════

  async getLeaderboard(limit = 10) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    
    const users = await this.userModel
      .find({ isBanned: { $ne: true }, isDeleted: { $ne: true } })
      .select('username fullName avatarUrl reputationScore positionsWon positionsLost tier')
      .sort({ reputationScore: -1 })
      .limit(safeLimit)
      .lean()
      .exec();

    return { data: users };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════

  private normalizeRecurrence(value: unknown) {
    const recurrence = String(value || 'daily').toLowerCase();
    const validRecurrences = ['daily', 'weekly', 'monthly', 'custom'];
    
    if (validRecurrences.includes(recurrence)) {
      return recurrence;
    }
    
    throw new BadRequestException(`Invalid recurrence value. Must be one of: ${validRecurrences.join(', ')}`);
  }

  private normalizeMarketType(value: unknown) {
    const marketType = String(value || 'consensus').toLowerCase();
    const validTypes = ['consensus', 'reflex', 'ladder', 'betrayal', 'prisoner_dilemma'];
    
    if (validTypes.includes(marketType)) {
      return marketType;
    }
    
    throw new BadRequestException(`Invalid market type. Must be one of: ${validTypes.join(', ')}`);
  }

  private computeNextExecutionAt(startDate: Date, recurrence: string, cronExpression?: string) {
    // Validate startDate
    if (Number.isNaN(startDate.getTime())) {
      return new Date();
    }

    if (recurrence === 'custom' && cronExpression) {
      // TODO: Implement proper cron parsing
      // For now, use startDate if in future, otherwise add 1 day
      const next = new Date(startDate);
      if (next.getTime() > Date.now()) {
        return next;
      }
      next.setDate(next.getDate() + 1);
      return next;
    }

    const next = new Date(startDate);

    // Find next execution date in the future
    while (next.getTime() <= Date.now()) {
      if (recurrence === 'weekly') {
        next.setDate(next.getDate() + 7);
      } else if (recurrence === 'monthly') {
        next.setMonth(next.getMonth() + 1);
      } else {
        // daily
        next.setDate(next.getDate() + 1);
      }
    }

    return next;
  }

  private summarizeMaintenanceResult(result: Record<string, unknown>) {
    const summary: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(result)) {
      if (Array.isArray(value)) {
        summary[key] = value.length;
        continue;
      }
      if (value && typeof value === 'object') {
        // Skip nested objects in summary
        continue;
      }
      summary[key] = value;
    }
    
    return summary;
  }

  private async logAudit(action: string, targetId: string, metadata: Record<string, any>) {
    try {
      const actorId = this.parseObjectId(metadata?.adminId) || this.systemActorId;
      const entityId = this.parseObjectId(targetId);

      // Retry logic for sequenceNumber collisions (up to 3 attempts)
      let saved = false;
      let retries = 0;
      const maxRetries = 3;

      while (!saved && retries < maxRetries) {
        try {
          const latest = await this.auditLogModel
            .findOne()
            .sort({ sequenceNumber: -1 })
            .select('sequenceNumber')
            .lean()
            .exec();

          const log = new this.auditLogModel({
            sequenceNumber: (latest?.sequenceNumber || 0) + 1,
            timestamp: new Date(),
            eventType: 'admin_action',
            actorId,
            actorType: metadata?.adminId ? 'admin' : 'system',
            entityType: metadata?.entityType || 'user',
            entityId,
            action,
            metadata,
            verificationStatus: 'unverified',
          });

          await log.save();
          saved = true;
          
          this.logger.log(`Audit: ${action} on ${targetId} (seq: ${log.sequenceNumber})`);
        } catch (error: any) {
          if (error.code === 11000 && error.message?.includes('sequenceNumber')) {
            retries++;
            this.logger.warn(`Sequence number collision for audit log, retry ${retries}/${maxRetries}`);
            
            // Add jitter to avoid thundering herd
            if (retries > 1) {
              await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));
            }
          } else {
            throw error;
          }
        }
      }

      if (!saved) {
        throw new Error(`Failed to save audit log after ${maxRetries} retries`);
      }
    } catch (error: any) {
      // Log error but don't crash the main operation
      this.logger.error(`Critical failure in logAudit for ${action}: ${error.message}`, error.stack);
    }
  }

  private parseObjectId(value?: string): Types.ObjectId | undefined {
    if (!value || !Types.ObjectId.isValid(value)) {
      return undefined;
    }
    return new Types.ObjectId(value);
  }
}