import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Group, GroupDocument, GroupBet, GroupBetDocument, User, UserDocument } from '@app/database';
import { ClientProxy, ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { PLATFORM_FEE_RATE } from '@app/common';

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(
    @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
    @InjectModel(GroupBet.name) private groupBetModel: Model<GroupBetDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject('WALLET_SERVICE') private walletClient: ClientProxy,
    @Inject('KAFKA_SERVICE') private kafkaClient: ClientKafka,
  ) {}

  // Group management
  async createGroup(data: { name: string; description?: string; isPublic?: boolean }, userId: string) {
    const group = new this.groupModel({
      ...data,
      createdBy: userId,
      members: [{ userId, role: 'admin', joinedAt: new Date() }],
      memberCount: 1,
    });
    await group.save();

    await this.userModel.findByIdAndUpdate(userId, { $inc: { groupMemberships: 1 } });
    this.logger.log(`Group created: ${group.name} by ${userId}`);
    return group;
  }

  async searchGroups(search?: string, limit = 20, offset = 0) {
    const filter: any = { isPublic: true };
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    return this.groupModel
      .find(filter)
      .skip(offset)
      .limit(limit)
      .sort({ memberCount: -1 })
      .exec();
  }

  async getGroup(id: string) {
    const group = await this.groupModel.findById(id).populate('members.userId', 'username avatarUrl');
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async joinGroup(groupId: string, userId: string, inviteCode?: string) {
    const group = await this.groupModel.findById(groupId);
    if (!group) throw new NotFoundException('Group not found');

    if (!group.isPublic) {
      const normalizedCode = String(inviteCode || '').trim().toUpperCase();
      const storedCode = String(group.inviteCode || '').trim().toUpperCase();
      if (!normalizedCode || !storedCode || normalizedCode !== storedCode) {
        throw new BadRequestException('Invalid or missing invite code for private group');
      }
    }

    const isMember = group.members.some((member) => member.userId.toString() === userId);
    if (isMember) throw new BadRequestException('Already a member');

    group.members.push({
      userId: new Types.ObjectId(userId) as any,
      role: 'member',
      joinedAt: new Date(),
    });
    group.memberCount += 1;
    await group.save();

    await this.userModel.findByIdAndUpdate(userId, { $inc: { groupMemberships: 1 } });
    return group;
  }

  async leaveGroup(groupId: string, userId: string) {
    const group = await this.groupModel.findById(groupId);
    if (!group) throw new NotFoundException('Group not found');

    group.members = group.members.filter((member) => member.userId.toString() !== userId);
    group.memberCount = Math.max(0, group.memberCount - 1);
    await group.save();

    await this.userModel.findByIdAndUpdate(userId, { $inc: { groupMemberships: -1 } });
    return group;
  }

  async createInvite(groupId: string, actorId: string, invitee?: string) {
    const group = await this.groupModel.findById(groupId);
    if (!group) throw new NotFoundException('Group not found');

    const actorMembership = group.members.some((member) => member.userId.toString() === actorId);
    const isOwner = group.createdBy.toString() === actorId;
    if (!actorMembership && !isOwner) {
      throw new BadRequestException('Only members can generate invite links');
    }

    if (!group.inviteCode) {
      group.inviteCode = this.generateInviteCode();
      await group.save();
    }

    let inviteeUser: { id: string; username: string; email: string } | null = null;
    const trimmedInvitee = String(invitee || '').trim();
    if (trimmedInvitee) {
      const inviteeRecord = await this.userModel
        .findOne({
          $or: [{ email: trimmedInvitee.toLowerCase() }, { username: trimmedInvitee }],
        })
        .select('_id username email')
        .lean()
        .exec();
      if (inviteeRecord) {
        inviteeUser = {
          id: inviteeRecord._id.toString(),
          username: inviteeRecord.username,
          email: inviteeRecord.email,
        };
      }
    }

    return {
      groupId: group._id.toString(),
      inviteCode: group.inviteCode,
      invitee: inviteeUser,
      invitePath: `/dashboard/groups/${group._id.toString()}?invite=${group.inviteCode}`,
    };
  }

  async updateGroup(
    groupId: string,
    updates: {
      name?: string;
      description?: string;
      category?: string;
      isPublic?: boolean;
      imageUrl?: string;
    },
    actorId: string,
  ) {
    const group = await this.groupModel.findById(groupId);
    if (!group) throw new NotFoundException('Group not found');

    const actorMember = group.members.find((member) => member.userId.toString() === actorId);
    const isOwner = group.createdBy.toString() === actorId;
    const canEdit = isOwner || actorMember?.role === 'admin' || actorMember?.role === 'moderator';
    if (!canEdit) {
      throw new BadRequestException('Not authorized to update this group');
    }

    if (updates.name !== undefined) {
      const trimmed = String(updates.name || '').trim();
      if (!trimmed) throw new BadRequestException('Group name cannot be empty');
      group.name = trimmed;
    }
    if (updates.description !== undefined) {
      const nextDescription = String(updates.description || '').trim();
      group.description = nextDescription || undefined;
    }
    if (updates.category !== undefined) {
      const nextCategory = String(updates.category || '').trim();
      group.category = nextCategory || undefined;
    }
    if (updates.isPublic !== undefined) {
      group.isPublic = Boolean(updates.isPublic);
    }
    if (updates.imageUrl !== undefined) {
      const nextImage = String(updates.imageUrl || '').trim();
      group.imageUrl = nextImage || undefined;
    }

    await group.save();
    return group;
  }

  async updateMemberRole(groupId: string, memberId: string, role: string, actorId: string) {
    const group = await this.groupModel.findById(groupId);
    if (!group) throw new NotFoundException('Group not found');

    const normalizedRole = String(role || '').toLowerCase();
    if (!['admin', 'moderator', 'member'].includes(normalizedRole)) {
      throw new BadRequestException('Invalid role');
    }

    const actorMember = group.members.find((member) => member.userId.toString() === actorId);
    const isOwner = group.createdBy.toString() === actorId;
    const canManage = isOwner || actorMember?.role === 'admin' || actorMember?.role === 'moderator';
    if (!canManage) {
      throw new BadRequestException('Not authorized to manage members');
    }

    const target = group.members.find((member) => member.userId.toString() === memberId);
    if (!target) throw new NotFoundException('Member not found');

    if (group.createdBy.toString() === memberId && normalizedRole !== 'admin') {
      throw new BadRequestException('Cannot demote group creator');
    }

    target.role = normalizedRole;
    await group.save();
    return group;
  }

  async removeMember(groupId: string, memberId: string, actorId: string) {
    const group = await this.groupModel.findById(groupId);
    if (!group) throw new NotFoundException('Group not found');

    const actorMember = group.members.find((member) => member.userId.toString() === actorId);
    const isOwner = group.createdBy.toString() === actorId;
    const canManage = isOwner || actorMember?.role === 'admin' || actorMember?.role === 'moderator';
    if (!canManage) {
      throw new BadRequestException('Not authorized to manage members');
    }

    if (group.createdBy.toString() === memberId) {
      throw new BadRequestException('Cannot remove group creator');
    }

    const beforeCount = group.members.length;
    group.members = group.members.filter((member) => member.userId.toString() !== memberId);
    if (group.members.length === beforeCount) {
      throw new NotFoundException('Member not found');
    }

    group.memberCount = Math.max(0, group.memberCount - 1);
    await group.save();
    await this.userModel.findByIdAndUpdate(memberId, { $inc: { groupMemberships: -1 } });
    return group;
  }

  // Group bets
  async createGroupBet(groupId: string, data: any, userId: string) {
    const group = await this.groupModel.findById(groupId);
    if (!group) throw new NotFoundException('Group not found');

    const bet = new this.groupBetModel({
      groupId,
      createdBy: userId,
      title: data.title,
      description: data.description,
      marketType: data.marketType,
      buyInAmount: data.buyInAmount,
      options: data.options || [],
      participants: [],
      status: 'active',
    });

    await this.joinBetInternal(bet, userId, data.selectedOption);
    await this.debitWallet(userId, data.buyInAmount, `Group Bet: ${data.title}`);

    group.activeBetsCount += 1;
    group.totalBets += 1;
    await group.save();

    return bet;
  }

  async getGroupBets(groupId: string) {
    return this.groupBetModel
      .find({ groupId })
      .sort({ createdAt: -1 })
      .populate('participants.userId', 'username avatarUrl');
  }

  async joinBet(betId: string, selectedOption: string, userId: string) {
    const bet = await this.groupBetModel.findById(betId);
    if (!bet) throw new NotFoundException('Bet not found');
    if (bet.status !== 'active') throw new BadRequestException('Bet is not active');

    const amount = bet.buyInAmount;
    await this.debitWallet(userId, amount, `Join Group Bet: ${bet.title}`);
    await this.joinBetInternal(bet, userId, selectedOption);
    return bet;
  }

  // Settlement
  async declareWinner(betId: string, winnerId: string, userId: string) {
    const bet = await this.groupBetModel.findById(betId);
    if (!bet) throw new NotFoundException('Bet not found');
    if (bet.createdBy.toString() !== userId) throw new BadRequestException('Only creator can declare winner');
    if (bet.status !== 'active') throw new BadRequestException('Bet not active');

    bet.status = 'pending_confirmation';
    bet.declaredWinnerId = new Types.ObjectId(winnerId);
    bet.confirmationDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await bet.save();

    return bet;
  }

  async confirmResult(betId: string, userId: string) {
    const bet = await this.groupBetModel.findOneAndUpdate(
      { _id: betId, status: 'pending_confirmation' },
      { $inc: { confirmations: 1 }, $set: { ['participants.$[elem].hasConfirmed']: true } },
      { arrayFilters: [{ 'elem.userId': userId }], new: true },
    );

    if (!bet) throw new NotFoundException('Bet not found or not in pending state');

    if (bet.confirmations >= bet.participants.length / 2) {
      await this.settleGroupBet(bet);
    }

    return bet;
  }

  async disagreeResult(betId: string, userId: string) {
    const bet = await this.groupBetModel.findOneAndUpdate(
      { _id: betId, status: 'pending_confirmation' },
      { $inc: { disagreements: 1 }, $set: { ['participants.$[elem].hasDisagreed']: true } },
      { arrayFilters: [{ 'elem.userId': userId }], new: true },
    );

    if (!bet) throw new NotFoundException('Bet not found');

    if (bet.disagreements >= bet.participants.length * 0.3) {
      bet.status = 'disputed';
      await bet.save();
    }

    return bet;
  }

  // Internal helpers
  private async joinBetInternal(bet: GroupBetDocument, userId: string, selectedOption?: string) {
    bet.participants.push({
      userId: new Types.ObjectId(userId) as any,
      selectedOption,
      hasConfirmed: false,
      hasDisagreed: false,
      isWinner: false,
      payoutAmount: 0,
      joinedAt: new Date(),
    });
    bet.totalPool += bet.buyInAmount;
    bet.prizePoolAfterFees = bet.totalPool * (1 - PLATFORM_FEE_RATE);
    bet.platformFeeCollected = bet.totalPool * PLATFORM_FEE_RATE;
    await bet.save();
  }

  private async debitWallet(userId: string, amount: number, description: string) {
    try {
      await lastValueFrom(
        this.walletClient.send('debit_balance', {
          userId,
          amount,
          currency: 'KSH',
          description,
          type: 'bet_placed',
        }),
      );
    } catch (e: any) {
      this.logger.error(`Wallet debit failed for ${userId}: ${e.message}`);
      throw new BadRequestException('Insufficient funds or wallet error');
    }
  }

  private async settleGroupBet(bet: GroupBetDocument) {
    bet.status = 'settled';

    if (bet.marketType === 'winner_takes_all' && bet.declaredWinnerId) {
      const winnerId = bet.declaredWinnerId.toString();
      const prize = bet.prizePoolAfterFees || 0;

      const participant = bet.participants.find((entry) => entry.userId.toString() === winnerId);
      if (participant) {
        participant.isWinner = true;
        participant.payoutAmount = prize;

        await lastValueFrom(
          this.walletClient.send('credit_balance', {
            userId: winnerId,
            amount: prize,
            currency: 'KSH',
            description: `Group Bet Win: ${bet.title}`,
            type: 'bet_payout',
          }),
        );
      }
    }

    bet.payoutProcessed = true;
    await bet.save();
  }

  private generateInviteCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }
}
