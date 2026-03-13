import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Market, MarketDocument, MarketComment, MarketCommentDocument, User, UserDocument } from '@app/database';
import { Inject } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { CommentCreatedEvent, CommentEditedEvent, CommentDeletedEvent } from '@app/kafka/events/comment-events';

@Injectable()
export class CommentService {
  constructor(
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @InjectModel(MarketComment.name) private commentModel: Model<MarketCommentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject('KAFKA_SERVICE') private kafkaClient: ClientKafka,
  ) {}

  private async resolveTargetId(id: string): Promise<Types.ObjectId> {
    if (Types.ObjectId.isValid(id)) {
      return new Types.ObjectId(id);
    }
    // If it's a slug, try looking it up as a market
    const market = await this.marketModel.findOne({ slug: id, isDeleted: { $ne: true } }).select('_id').lean().exec();
    if (market) return market._id as Types.ObjectId;
    
    throw new NotFoundException('Target entity not found');
  }

  async getComments(marketId: string, opts: { limit: number; offset: number }) {
    const targetOid = await this.resolveTargetId(marketId);
    const [comments, total] = await Promise.all([
      this.commentModel
        .find({ marketId: targetOid, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .skip(opts.offset)
        .limit(opts.limit)
        .lean()
        .exec(),
      this.commentModel.countDocuments({ marketId: targetOid, isDeleted: { $ne: true } }),
    ]);
    return {
      data: comments.map((c) => ({
        id: c._id.toString(),
        userId: c.userId.toString(),
        body: c.body,
        username: c.username,
        parentId: c.parentId?.toString(),
        likes: c.likes || 0,
        status: (c as any).status || 'active',
        createdAt: (c as any).createdAt,
        editedAt: (c as any).editedAt,
      })),
      meta: { total, limit: opts.limit, offset: opts.offset },
    };
  }

  async addComment(marketId: string, user: UserDocument, body: string, parentId?: string) {
    if (!body || body.trim().length < 1) throw new BadRequestException('Comment body is required');
    if (body.trim().length > 1000) throw new BadRequestException('Comment must be 1000 characters or fewer');

    // Robust Ban Check: Even if JWT is valid, check DB for latest status
    const dbUser = await this.userModel.findById(user._id).select('isBanned banReason').exec();
    if (dbUser?.isBanned) {
      throw new BadRequestException(`Your account is restricted. Reason: ${dbUser.banReason || 'Policy violation'}`);
    }

    const targetOid = await this.resolveTargetId(marketId);
    let parentOid = undefined;
    if (parentId && Types.ObjectId.isValid(parentId)) {
      parentOid = new Types.ObjectId(parentId);
      const parentComment = await this.commentModel.findById(parentOid).exec();
      if (!parentComment) throw new NotFoundException('Parent comment not found');
    }

    const username =
      (user as any).username ||
      (user as any).displayName ||
      `@user_${user._id.toString().slice(-6)}`;

    const comment = await this.commentModel.create({
      marketId: targetOid,
      userId: user._id,
      username,
      parentId: parentOid,
      body: body.trim(),
    });

    const dto = {
      commentId: comment._id.toString(),
      marketId: comment.marketId.toString(),
      userId: comment.userId.toString(),
      body: comment.body,
      parentId: comment.parentId?.toString(),
      username: comment.username,
      likes: 0,
      createdAt: (comment as any).createdAt.toISOString(),
      status: 'active',
    };

    this.kafkaClient.emit(
      'comment.events',
      new CommentCreatedEvent(dto),
    );

    return dto;
  }

  async editComment(commentId: string, userId: string, newBody: string) {
    if (!newBody || newBody.trim().length < 1) throw new BadRequestException('Comment body is required');
    if (newBody.trim().length > 1000) throw new BadRequestException('Comment must be 1000 characters or fewer');

    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment || comment.isDeleted) throw new NotFoundException('Comment not found');

    if (comment.userId.toString() !== userId) {
      throw new BadRequestException('You do not own this comment');
    }

    comment.body = newBody.trim();
    comment.editedAt = new Date();
    await comment.save();

    const dto = {
      commentId: comment._id.toString(),
      marketId: comment.marketId.toString(),
      userId: comment.userId.toString(),
      body: comment.body,
      parentId: comment.parentId?.toString(),
      username: comment.username,
      likes: comment.likes,
      createdAt: (comment as any).createdAt.toISOString(),
      editedAt: (comment as any).editedAt?.toISOString(),
      status: comment.status || 'active',
    };

    this.kafkaClient.emit(
      'comment.events',
      new CommentEditedEvent(dto),
    );

    return dto;
  }

  async deleteComment(commentId: string, userId: string, isAdmin?: boolean) {
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment || comment.isDeleted) throw new NotFoundException('Comment not found');

    if (comment.userId.toString() !== userId && !isAdmin) {
      throw new BadRequestException('You do not own this comment');
    }

    comment.isDeleted = true;
    comment.status = isAdmin ? 'deletedByAdmin' : 'deleted';
    await comment.save();

    this.kafkaClient.emit(
      'comment.events',
      new CommentDeletedEvent({
        commentId: comment._id.toString(),
        marketId: comment.marketId.toString(),
      }),
    );

    return { success: true };
  }

  async toggleLike(commentId: string, userId: string) {
    if (!Types.ObjectId.isValid(commentId)) throw new BadRequestException('Invalid comment ID');
    const userOid = new Types.ObjectId(userId);
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment || comment.isDeleted) throw new NotFoundException('Comment not found');

    const alreadyLiked = comment.likedBy.some((id) => id.toString() === userId);
    if (alreadyLiked) {
      comment.likedBy = comment.likedBy.filter((id) => id.toString() !== userId);
      comment.likes = Math.max(0, comment.likes - 1);
    } else {
      comment.likedBy.push(userOid);
      comment.likes += 1;
    }
    await comment.save();
    return { liked: !alreadyLiked, likes: comment.likes };
  }
}
