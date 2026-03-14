import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Group, GroupDocument, GroupBet, GroupBetDocument, User, UserDocument } from '@app/database';
import { ClientProxy, ClientKafka } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import { KAFKA_TOPICS, PLATFORM_FEE_RATE } from '@app/common';

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);
  private readonly kafkaEnabled =
    Boolean(process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER) &&
    !['1', 'true', 'yes'].includes(String(process.env.KAFKA_DISABLED || '').toLowerCase());

  constructor(
    @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
    @InjectModel(GroupBet.name) private groupBetModel: Model<GroupBetDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject('WALLET_SERVICE') private walletClient: ClientProxy,
    @Inject('KAFKA_SERVICE') private kafkaClient: ClientKafka,
  ) {}

  // Group management
  async createGroup(
    data: {
      name: string;
      description?: string;
      isPublic?: boolean;
      category?: string;
      avatarUrl?: string;
      imageUrl?: string;
      maxMembers?: number;
      minBuyIn?: number;
      maxBuyIn?: number;
      requiresApproval?: boolean;
      inviteCode?: string;
    },
    userId: string,
  ) {
    const trimmedName = String(data?.name || '').trim();
    if (!trimmedName) {
      throw new BadRequestException('Group name is required');
    }

    const slug = await this.ensureUniqueGroupSlug(trimmedName);
    const description = String(data?.description || '').trim() || undefined;
    const category = String(data?.category || '').trim() || undefined;
    const avatarUrl = String(data?.avatarUrl || '').trim() || undefined;
    const imageUrl = String(data?.imageUrl || '').trim() || undefined;
    const isPublic = data?.isPublic !== false;
    const requiresApproval = Boolean(data?.requiresApproval);

    const maxMembers = Number(data?.maxMembers);
    if (Number.isFinite(maxMembers) && maxMembers < 1) {
      throw new BadRequestException('maxMembers must be at least 1');
    }

    const minBuyIn = Number(data?.minBuyIn);
    if (Number.isFinite(minBuyIn) && minBuyIn < 0) {
      throw new BadRequestException('minBuyIn must be greater than or equal to 0');
    }

    const maxBuyIn = Number(data?.maxBuyIn);
    if (Number.isFinite(maxBuyIn) && maxBuyIn < 0) {
      throw new BadRequestException('maxBuyIn must be greater than or equal to 0');
    }

    if (Number.isFinite(minBuyIn) && Number.isFinite(maxBuyIn) && minBuyIn > maxBuyIn) {
      throw new BadRequestException('minBuyIn cannot exceed maxBuyIn');
    }

    let inviteCode = String(data?.inviteCode || '').trim().toUpperCase();
    if (!isPublic && !inviteCode) {
      inviteCode = this.generateInviteCode();
    }

    const payload: Partial<GroupDocument> = {
      name: trimmedName,
      description,
      category,
      avatarUrl,
      imageUrl,
      isPublic,
      requiresApproval,
      slug,
      createdBy: new Types.ObjectId(userId),
      members: [{ userId: new Types.ObjectId(userId) as any, role: 'admin', joinedAt: new Date() }],
      memberCount: 1,
    };

    if (Number.isFinite(maxMembers)) {
      payload.maxMembers = Math.floor(maxMembers);
    }
    if (Number.isFinite(minBuyIn)) {
      payload.minBuyIn = minBuyIn;
    }
    if (Number.isFinite(maxBuyIn)) {
      payload.maxBuyIn = maxBuyIn;
    }
    if (!isPublic && inviteCode) {
      payload.inviteCode = inviteCode;
    }

    const group = new this.groupModel(payload);
    await group.save();

    await this.userModel.findByIdAndUpdate(userId, { $inc: { groupMemberships: 1 } });
    this.dispatchNotification(
      userId,
      'Group Created',
      `Your group "${group.name}" is ready.`,
      'group_created',
      ['in_app'],
    );
    this.logger.log(`Group created: ${group.name} by ${userId}`);
    return group;
  }

  async searchGroups(search?: string, limit = 20, offset = 0) {
    const filter: any = { isPublic: true, isSuspended: { $ne: true } };
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    return this.groupModel
      .find(filter)
      .skip(offset)
      .limit(limit)
      .sort({ memberCount: -1 })
      .populate('members.userId', 'username avatarUrl')
      .exec();
  }

  async getGroup(id: string) {
    const group = await this.findGroupByIdentifier(id, true);
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async joinGroup(groupId: string, userId: string, inviteCode?: string) {
    const group = await this.findGroupByIdentifier(groupId);
    if (!group) throw new NotFoundException('Group not found');
    this.assertGroupActive(group);

    const maxMembers = Number.isFinite(group.maxMembers)
      ? group.maxMembers
      : Number.POSITIVE_INFINITY;
    if (group.memberCount >= maxMembers) {
      throw new BadRequestException('Group has reached its member limit');
    }

    if (!group.isPublic) {
      const normalizedCode = String(inviteCode || '').trim().toUpperCase();
      const storedCode = String(group.inviteCode || '').trim().toUpperCase();
      if (!normalizedCode || !storedCode || normalizedCode !== storedCode) {
        throw new BadRequestException('Invalid or missing invite code for private group');
      }
    }

    const isMember = group.members.some((member) => member.userId.toString() === userId);
    if (isMember) throw new BadRequestException('Already a member');

    const isPending = Array.isArray(group.pendingMembers)
      ? group.pendingMembers.some((member) => member.userId.toString() === userId)
      : false;
    if (isPending) {
      return { status: 'pending', group };
    }

    if (group.requiresApproval) {
      group.pendingMembers = [
        ...(group.pendingMembers || []),
        { userId: new Types.ObjectId(userId) as any, requestedAt: new Date() },
      ];
      await group.save();

      const adminIds = group.members
        .filter((member) => member.role === 'admin')
        .map((member) => member.userId.toString());

      this.dispatchNotification(
        userId,
        'Join Request Sent',
        `Your request to join "${group.name}" is pending approval.`,
        'group_join_pending',
        ['in_app'],
      );
      this.notifyMany(
        adminIds,
        `${group.name}: New Join Request`,
        'A new member is awaiting approval.',
        'group_join_request',
        userId,
        ['in_app', 'push'],
      );

      return { status: 'pending', group };
    }

    group.members.push({
      userId: new Types.ObjectId(userId) as any,
      role: 'member',
      joinedAt: new Date(),
    });
    group.memberCount += 1;
    await group.save();

    await this.userModel.findByIdAndUpdate(userId, { $inc: { groupMemberships: 1 } });
    this.dispatchNotification(
      userId,
      'Joined Group',
      `You joined "${group.name}".`,
      'group_joined',
      ['in_app'],
    );
    const adminIds = group.members
      .filter((member) => member.role === 'admin')
      .map((member) => member.userId.toString());
    this.notifyMany(
      adminIds,
      `${group.name}: New Member`,
      'A new member joined your group.',
      'group_member_joined',
      userId,
      ['in_app', 'push'],
    );
    return group;
  }

  async approveJoinRequest(groupId: string, memberId: string, actorId: string) {
    const group = await this.findGroupByIdentifier(groupId, true);
    if (!group) throw new NotFoundException('Group not found');
    this.assertGroupActive(group);

    const actorMember = group.members.find((member) => member.userId.toString() === actorId);
    const isOwner = group.createdBy.toString() === actorId;
    const canManage = isOwner || actorMember?.role === 'admin' || actorMember?.role === 'moderator';
    if (!canManage) {
      throw new BadRequestException('Not authorized to manage join requests');
    }

    const pendingIndex = (group.pendingMembers || []).findIndex(
      (member) => member.userId.toString() === memberId,
    );
    if (pendingIndex === -1) {
      throw new NotFoundException('Join request not found');
    }

    const maxMembers = Number.isFinite(group.maxMembers)
      ? group.maxMembers
      : Number.POSITIVE_INFINITY;
    if (group.memberCount >= maxMembers) {
      throw new BadRequestException('Group has reached its member limit');
    }

    group.pendingMembers.splice(pendingIndex, 1);
    group.members.push({
      userId: new Types.ObjectId(memberId) as any,
      role: 'member',
      joinedAt: new Date(),
    });
    group.memberCount += 1;
    await group.save();

    await this.userModel.findByIdAndUpdate(memberId, { $inc: { groupMemberships: 1 } });
    this.dispatchNotification(
      memberId,
      'Join Request Approved',
      `Your request to join "${group.name}" was approved.`,
      'group_join_approved',
      ['in_app', 'push'],
    );

    return group;
  }

  async rejectJoinRequest(
    groupId: string,
    memberId: string,
    actorId: string,
    reason?: string,
  ) {
    const group = await this.findGroupByIdentifier(groupId, true);
    if (!group) throw new NotFoundException('Group not found');
    this.assertGroupActive(group);

    const actorMember = group.members.find((member) => member.userId.toString() === actorId);
    const isOwner = group.createdBy.toString() === actorId;
    const canManage = isOwner || actorMember?.role === 'admin' || actorMember?.role === 'moderator';
    if (!canManage) {
      throw new BadRequestException('Not authorized to manage join requests');
    }

    const pendingIndex = (group.pendingMembers || []).findIndex(
      (member) => member.userId.toString() === memberId,
    );
    if (pendingIndex === -1) {
      throw new NotFoundException('Join request not found');
    }

    group.pendingMembers.splice(pendingIndex, 1);
    await group.save();

    const message = reason && reason.trim()
      ? `Your request to join "${group.name}" was declined. ${reason.trim()}`
      : `Your request to join "${group.name}" was declined.`;
    this.dispatchNotification(
      memberId,
      'Join Request Declined',
      message,
      'group_join_rejected',
      ['in_app', 'push'],
    );

    return group;
  }

  async leaveGroup(groupId: string, userId: string) {
    const group = await this.findGroupByIdentifier(groupId);
    if (!group) throw new NotFoundException('Group not found');

    group.members = group.members.filter((member) => member.userId.toString() !== userId);
    group.memberCount = Math.max(0, group.memberCount - 1);
    await group.save();

    await this.userModel.findByIdAndUpdate(userId, { $inc: { groupMemberships: -1 } });
    this.dispatchNotification(
      userId,
      'Left Group',
      `You left "${group.name}".`,
      'group_left',
      ['in_app'],
    );
    return group;
  }

  async createInvite(groupId: string, actorId: string, invitee?: string) {
    const group = await this.findGroupByIdentifier(groupId);
    if (!group) throw new NotFoundException('Group not found');
    this.assertGroupActive(group);

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
        this.dispatchNotification(
          inviteeUser.id,
          `${group.name} Invitation`,
          `You were invited to join "${group.name}".`,
          'group_invite',
          ['in_app', 'email', 'push'],
        );
      }
    }

    return {
      groupId: group._id.toString(),
      inviteCode: group.inviteCode,
      invitee: inviteeUser,
      invitePath: `/dashboard/groups/${group.slug || group._id.toString()}?invite=${group.inviteCode}`,
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
      avatarUrl?: string;
      maxMembers?: number;
      minBuyIn?: number;
      maxBuyIn?: number;
      requiresApproval?: boolean;
      inviteCode?: string;
    },
    actorId: string,
  ) {
    const group = await this.findGroupByIdentifier(groupId);
    if (!group) throw new NotFoundException('Group not found');
    this.assertGroupActive(group);

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
      group.slug = await this.ensureUniqueGroupSlug(trimmed, group._id.toString());
    }
    if (updates.description !== undefined) {
      const nextDescription = String(updates.description || '').trim();
      group.description = nextDescription || undefined;
    }
    if (updates.category !== undefined) {
      const trimmed = String(updates.category || '').trim();
      group.category = trimmed || undefined;
    }
    if (updates.isPublic !== undefined) {
      group.isPublic = Boolean(updates.isPublic);
      if (!group.isPublic && !group.inviteCode) {
        group.inviteCode = this.generateInviteCode();
      }
    }
    if (updates.imageUrl !== undefined) {
      const trimmed = String(updates.imageUrl || '').trim();
      group.imageUrl = trimmed || undefined;
    }
    if (updates.avatarUrl !== undefined) {
      const trimmed = String(updates.avatarUrl || '').trim();
      group.avatarUrl = trimmed || undefined;
    }
    if (updates.maxMembers !== undefined) {
      const maxMembers = Number(updates.maxMembers);
      if (!Number.isFinite(maxMembers) || maxMembers < 1) {
        throw new BadRequestException('maxMembers must be at least 1');
      }
      if (maxMembers < group.memberCount) {
        throw new BadRequestException('maxMembers cannot be lower than current member count');
      }
      group.maxMembers = Math.floor(maxMembers);
    }
    if (updates.minBuyIn !== undefined || updates.maxBuyIn !== undefined) {
      const minBuyIn = updates.minBuyIn !== undefined ? Number(updates.minBuyIn) : group.minBuyIn;
      const maxBuyIn = updates.maxBuyIn !== undefined ? Number(updates.maxBuyIn) : group.maxBuyIn;
      if (!Number.isFinite(minBuyIn) || minBuyIn < 0) {
        throw new BadRequestException('minBuyIn must be greater than or equal to 0');
      }
      if (!Number.isFinite(maxBuyIn) || maxBuyIn < 0) {
        throw new BadRequestException('maxBuyIn must be greater than or equal to 0');
      }
      if (minBuyIn > maxBuyIn) {
        throw new BadRequestException('minBuyIn cannot exceed maxBuyIn');
      }
      group.minBuyIn = minBuyIn;
      group.maxBuyIn = maxBuyIn;
    }
    if (updates.requiresApproval !== undefined) {
      group.requiresApproval = Boolean(updates.requiresApproval);
    }
    if (updates.inviteCode !== undefined) {
      const trimmed = String(updates.inviteCode || '').trim().toUpperCase();
      if (!group.isPublic && trimmed) {
        group.inviteCode = trimmed;
      } else if (!group.isPublic && !trimmed) {
        group.inviteCode = this.generateInviteCode();
      }
    }

    await group.save();
    return group;
  }

  async updateMemberRole(groupId: string, memberId: string, role: string, actorId: string) {
    const group = await this.findGroupByIdentifier(groupId);
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
    this.dispatchNotification(
      memberId,
      'Group Role Updated',
      `Your role in "${group.name}" is now ${normalizedRole}.`,
      'group_role_updated',
      ['in_app', 'push'],
    );
    return group;
  }

  async removeMember(groupId: string, memberId: string, actorId: string) {
    const group = await this.findGroupByIdentifier(groupId);
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
    this.dispatchNotification(
      memberId,
      'Removed From Group',
      `You were removed from "${group.name}".`,
      'group_member_removed',
      ['in_app', 'push'],
    );
    return group;
  }

  // Group markets
  async createGroupBet(groupId: string, data: any, userId: string) {
    const group = await this.findGroupByIdentifier(groupId);
    if (!group) throw new NotFoundException('Group not found');
    this.assertGroupActive(group);

    const actorMember = group.members.find((member) => member.userId.toString() === userId);
    const isOwner = group.createdBy.toString() === userId;
    const canCreate = isOwner || actorMember?.role === 'admin' || actorMember?.role === 'moderator';
    if (!canCreate) {
      throw new BadRequestException('Not authorized to create group markets');
    }

    const marketType = String(data.marketType || '').toLowerCase();
    if (!['winner_takes_all', 'odd_one_out'].includes(marketType)) {
      throw new BadRequestException('Invalid group market type');
    }

    const subtype = String(data.marketSubtype || data.type || 'poll').toLowerCase();
    const validSubtypes = ['poll', 'betrayal', 'reflex', 'ladder', 'divergence'];
    const marketSubtype = validSubtypes.includes(subtype) ? subtype : 'poll';
    const title = String(data.title || '').trim();
    if (!title) {
      throw new BadRequestException('title is required');
    }
    const betSlug = await this.ensureUniqueGroupBetSlug(group._id.toString(), title);

      const normalizedOptions = Array.isArray(data.options)
        ? data.options
            .map((option: unknown) => String(option || '').trim())
            .filter(Boolean)
        : [];
      const buyInAmount = Number(data.buyInAmount || 0);
      if (!Number.isFinite(buyInAmount) || buyInAmount <= 0) {
        throw new BadRequestException('buyInAmount must be greater than 0');
      }
      if (Number.isFinite(group.minBuyIn) && buyInAmount < group.minBuyIn) {
        throw new BadRequestException('buyInAmount must be at least the group minimum');
      }
      if (Number.isFinite(group.maxBuyIn) && buyInAmount > group.maxBuyIn) {
        throw new BadRequestException('buyInAmount exceeds the group maximum');
      }
      if (marketType === 'odd_one_out' && normalizedOptions.length < 3) {
        throw new BadRequestException('Odd-one-out markets require at least 3 options');
      }

      const closeTimeRaw = data.closeTime || data.close_time;
      const closeTime = closeTimeRaw ? new Date(closeTimeRaw) : null;
      if (!closeTime || Number.isNaN(closeTime.getTime())) {
        throw new BadRequestException('closeTime is required');
      }
      if (closeTime.getTime() <= Date.now()) {
        throw new BadRequestException('closeTime must be in the future');
      }

      const settlementTimeRaw = data.settlementTime || data.settlement_time;
      const settlementTime = settlementTimeRaw
        ? new Date(settlementTimeRaw)
        : new Date(closeTime.getTime() + 60 * 60 * 1000);
      if (Number.isNaN(settlementTime.getTime())) {
        throw new BadRequestException('settlementTime is invalid');
      }
      if (settlementTime.getTime() < closeTime.getTime()) {
        throw new BadRequestException('settlementTime must be after closeTime');
      }

      const selectedOption = data.selectedOption ? String(data.selectedOption).trim() : '';
      if (
        selectedOption &&
        normalizedOptions.length > 0 &&
        !normalizedOptions.includes(selectedOption)
      ) {
        throw new BadRequestException('selectedOption must match one of the options');
      }

      const bet = new this.groupBetModel({
        groupId: group._id,
        createdBy: userId,
        title,
      slug: betSlug,
      description: String(data.description || '').trim(),
      marketType,
        marketSubtype,
        buyInAmount,
        closeTime,
        settlementTime,
        options: normalizedOptions,
        participants: [],
        status: 'active',
      });

      await this.joinBetInternal(bet, userId, selectedOption || undefined);
      await this.debitWallet(userId, buyInAmount, `Group Market: ${data.title}`);

    group.activeBetsCount += 1;
    group.totalBets += 1;
    if (!group.featuredMarketId) {
      group.featuredMarketId = bet._id;
    }
    await group.save();
    this.notifyMany(
      this.getMemberIds(group),
      `${group.name}: New Market`,
      `A new group market "${bet.title}" is now live.`,
      'group_market_created',
      userId,
      ['in_app', 'push'],
    );

    return bet;
  }

  async getGroupBets(groupId: string) {
    const group = await this.findGroupByIdentifier(groupId);
    if (!group) throw new NotFoundException('Group not found');
    return this.groupBetModel
      .find({ groupId: group._id })
      .sort({ createdAt: -1 })
      .populate('participants.userId', 'username avatarUrl');
  }

  async joinBet(betId: string, selectedOption: string, userId: string) {
    const bet = await this.groupBetModel.findById(betId);
    if (!bet) throw new NotFoundException('Market not found');
    if (bet.status !== 'active') throw new BadRequestException('Market is not active');
    if (bet.closeTime && new Date() > bet.closeTime) {
      throw new BadRequestException('Market is closed');
    }

    const amount = bet.buyInAmount;
    await this.debitWallet(userId, amount, `Join Group Market: ${bet.title}`);
    await this.joinBetInternal(bet, userId, selectedOption);
    this.dispatchNotification(
      userId,
      'Group Market Joined',
      `You joined "${bet.title}".`,
      'group_market_joined',
      ['in_app'],
    );
    this.dispatchNotification(
      bet.createdBy.toString(),
      'New Group Prediction',
      `A participant joined "${bet.title}".`,
      'group_market_participant_joined',
      ['in_app', 'push'],
    );
    return bet;
  }

  // Settlement
  async declareWinner(betId: string, winnerId: string, userId: string) {
    const bet = await this.groupBetModel.findById(betId);
    if (!bet) throw new NotFoundException('Market not found');
    if (bet.createdBy.toString() !== userId) throw new BadRequestException('Only creator can declare winner');
    if (bet.status !== 'active') throw new BadRequestException('Market not active');

    bet.status = 'pending_confirmation';
    bet.declaredWinnerId = new Types.ObjectId(winnerId);
    bet.confirmationDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await bet.save();
    this.notifyMany(
      bet.participants.map((entry) => entry.userId.toString()),
      `${bet.title}: Confirm Outcome`,
      'A winner was declared. Confirm or dispute this result.',
      'group_market_pending_confirmation',
      userId,
      ['in_app', 'push'],
    );

    return bet;
  }

  async confirmResult(betId: string, userId: string) {
    const bet = await this.groupBetModel.findOneAndUpdate(
      { _id: betId, status: 'pending_confirmation' },
      { $inc: { confirmations: 1 }, $set: { ['participants.$[elem].hasConfirmed']: true } },
      { arrayFilters: [{ 'elem.userId': userId }], new: true },
    );

    if (!bet) throw new NotFoundException('Market not found or not in pending state');

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

    if (!bet) throw new NotFoundException('Market not found');

    if (bet.disagreements >= bet.participants.length * 0.3) {
      bet.status = 'disputed';
      await bet.save();
      this.dispatchNotification(
        bet.createdBy.toString(),
        `${bet.title}: Disputed`,
        'Participants disputed this result. Please review.',
        'group_market_disputed',
        ['in_app', 'push'],
      );
    }

    return bet;
  }

  async closeGroupBet(groupId: string, betId: string, actorId: string) {
    const group = await this.findGroupByIdentifier(groupId);
    if (!group) throw new NotFoundException('Group not found');
    this.assertCanManageGroup(group, actorId);

    const bet = await this.findGroupBetByIdentifier(group._id.toString(), betId);
    if (!bet) throw new NotFoundException('Market not found');

    if (bet.status === 'settled' || bet.status === 'cancelled') {
      return bet;
    }

    const wasActive = bet.status === 'active';
    bet.status = 'cancelled';
    bet.payoutProcessed = false;
    await bet.save();

    if (wasActive && group.activeBetsCount > 0) {
      group.activeBetsCount -= 1;
      await group.save();
    }
    this.notifyMany(
      bet.participants.map((entry) => entry.userId.toString()),
      `${bet.title}: Closed`,
      'This group market was closed by an admin.',
      'group_market_closed',
      actorId,
      ['in_app', 'push'],
    );

    return bet;
  }

  async deleteGroupBet(groupId: string, betId: string, actorId: string) {
    const group = await this.findGroupByIdentifier(groupId);
    if (!group) throw new NotFoundException('Group not found');
    this.assertCanManageGroup(group, actorId);

    const bet = await this.findGroupBetByIdentifier(group._id.toString(), betId);
    if (!bet) throw new NotFoundException('Market not found');

    if (!['settled', 'cancelled'].includes(bet.status)) {
      throw new BadRequestException('Close the market before deleting it');
    }

    await this.groupBetModel.deleteOne({ _id: bet._id }).exec();

    if (group.totalBets > 0) {
      group.totalBets -= 1;
    }
    await group.save();
    this.notifyMany(
      bet.participants.map((entry) => entry.userId.toString()),
      `${bet.title}: Deleted`,
      'This group market was deleted after closure.',
      'group_market_deleted',
      actorId,
      ['in_app', 'push'],
    );

    return { success: true, id: betId };
  }

  async deleteGroup(groupId: string, actorId: string) {
    const group = await this.findGroupByIdentifier(groupId);
    if (!group) throw new NotFoundException('Group not found');
    this.assertCanManageGroup(group, actorId);

    const unresolvedBetsCount = await this.groupBetModel.countDocuments({
      groupId: group._id,
      status: { $nin: ['settled', 'cancelled'] },
    });
    if (unresolvedBetsCount > 0) {
      throw new BadRequestException(
        'Resolve all group markets (settled or cancelled) before deleting this group',
      );
    }

    await this.groupBetModel.deleteMany({ groupId: group._id }).exec();
    await this.groupModel.deleteOne({ _id: group._id }).exec();

    const memberIds = Array.from(
      new Set(group.members.map((member) => member.userId?.toString()).filter(Boolean)),
    );
    if (memberIds.length) {
      await this.userModel.updateMany(
        { _id: { $in: memberIds.map((id) => new Types.ObjectId(id)) } },
        { $inc: { groupMemberships: -1 } },
      );
      this.notifyMany(
        memberIds,
        `${group.name}: Group Removed`,
        'This group was deleted by an admin after all markets were resolved.',
        'group_deleted',
        actorId,
        ['in_app', 'push'],
      );
    }

    return { success: true, id: groupId };
  }

  // Internal helpers
  private assertGroupActive(group: GroupDocument) {
    if (group.isSuspended) {
      throw new BadRequestException('Group is currently suspended');
    }
  }

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
        }).pipe(timeout(8000)),
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
            description: `Group Market Win: ${bet.title}`,
            type: 'bet_payout',
          }).pipe(timeout(8000)),
        );
        this.dispatchNotification(
          winnerId,
          'Group Market Won',
          `You won "${bet.title}" and received a payout.`,
          'group_market_payout',
          ['in_app', 'push'],
        );
      }
    }

    bet.payoutProcessed = true;
    await bet.save();
  }

  private getMemberIds(group: GroupDocument) {
    return Array.from(
      new Set(group.members.map((member) => member.userId?.toString()).filter(Boolean)),
    );
  }

  private notifyMany(
    userIds: string[],
    title: string,
    message: string,
    type: string,
    excludeUserId?: string,
    channels: string[] = ['in_app'],
  ) {
    if (!this.kafkaEnabled) return;
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    uniqueUserIds.forEach((userId) => {
      if (excludeUserId && userId === excludeUserId) return;
      this.dispatchNotification(userId, title, message, type, channels);
    });
  }

  private dispatchNotification(
    userId: string,
    title: string,
    message: string,
    type = 'system',
    channels: string[] = ['in_app'],
  ) {
    if (!userId) return;
    if (!this.kafkaEnabled) return;
    this.kafkaClient.emit(KAFKA_TOPICS.NOTIFICATION_DISPATCH, {
      userId,
      title,
      message,
      type,
      channels,
    });
  }

  private generateInviteCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  private slugify(value: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private async ensureUniqueGroupSlug(name: string, excludeGroupId?: string) {
    const base = this.slugify(name) || `group-${Date.now()}`;
    let candidate = base;
    let attempt = 0;
    while (attempt < 1000) {
      const existing = await this.groupModel
        .findOne({
          slug: candidate,
          ...(excludeGroupId ? { _id: { $ne: new Types.ObjectId(excludeGroupId) } } : {}),
        })
        .select('_id')
        .lean()
        .exec();
      if (!existing) return candidate;
      attempt += 1;
      candidate = `${base}-${attempt + 1}`;
    }
    return `${base}-${Date.now()}`;
  }

  private async ensureUniqueGroupBetSlug(groupId: string, title: string, excludeBetId?: string) {
    const base = this.slugify(title) || `market-${Date.now()}`;
    let candidate = `${base}-${this.slugify(groupId).slice(-6)}`;
    let attempt = 0;
    while (attempt < 1000) {
      const existing = await this.groupBetModel
        .findOne({
          slug: candidate,
          ...(excludeBetId ? { _id: { $ne: new Types.ObjectId(excludeBetId) } } : {}),
        })
        .select('_id')
        .lean()
        .exec();
      if (!existing) return candidate;
      attempt += 1;
      candidate = `${base}-${this.slugify(groupId).slice(-6)}-${attempt + 1}`;
    }
    return `${base}-${Date.now()}`;
  }

  private async findGroupByIdentifier(identifier: string, populateMembers = false) {
    const normalized = decodeURIComponent(String(identifier || '').trim()).toLowerCase();
    let query = this.groupModel.findOne({
      $or: [
        ...(Types.ObjectId.isValid(normalized) ? [{ _id: new Types.ObjectId(normalized) }] : []),
        { slug: normalized },
      ],
    });
    if (populateMembers) {
      query = query
        .populate('members.userId', 'username avatarUrl')
        .populate('pendingMembers.userId', 'username avatarUrl');
    }
    return query.exec();
  }

  private async findGroupBetByIdentifier(groupId: string, betIdentifier: string) {
    const normalized = decodeURIComponent(String(betIdentifier || '').trim()).toLowerCase();
    return this.groupBetModel
      .findOne({
        groupId: new Types.ObjectId(groupId),
        $or: [
          ...(Types.ObjectId.isValid(normalized)
            ? [{ _id: new Types.ObjectId(normalized) }]
            : []),
          { slug: normalized },
        ],
      })
      .exec();
  }

  private assertCanManageGroup(group: GroupDocument, actorId: string) {
    const actorMember = group.members.find((member) => member.userId.toString() === actorId);
    const isOwner = group.createdBy.toString() === actorId;
    const canManage = isOwner || actorMember?.role === 'admin' || actorMember?.role === 'moderator';
    if (!canManage) {
      throw new BadRequestException('Not authorized to manage this group');
    }
  }
}
