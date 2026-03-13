import { Controller, Get, Post, Body, Param, Query, UseGuards, Put, Patch, Delete, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { MarketService } from './market.service';
import { CommentService } from './comment.service';
import { CreateMarketDto, JwtAuthGuard, CurrentUser, Roles, UserRole, RolesGuard, RateLimit } from '@app/common';
import { UserDocument } from '@app/database';

@Controller('markets')
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly commentService: CommentService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async create(@Body() createMarketDto: CreateMarketDto, @CurrentUser() user: UserDocument) {
    return this.marketService.create(createMarketDto, user._id.toString());
  }

  @Get()
  async findAll(@Query() query: any) {
    return this.marketService.findAll(query);
  }

  @Get(':id')
  @RateLimit({ limit: 500, ttl: 60 })
  async findOne(@Param('id') id: string) {
    return this.marketService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async update(
    @Param('id') id: string,
    @Body() updates: Partial<CreateMarketDto>,
    @CurrentUser() user: UserDocument,
  ) {
    return this.marketService.updateMarket(id, updates, user._id.toString());
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.marketService.deleteMarket(id, user._id.toString());
  }

  @Put(':id/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async closeMarket(@Param('id') id: string) {
    return this.marketService.closeMarket(id);
  }

  @Post(':id/settle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async settleMarket(
    @Param('id') id: string,
    @Body('winningOptionId') winningOptionId?: string,
  ) {
    return this.marketService.settleMarket(id, winningOptionId);
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  @Get(':id/comments')
  async getComments(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.commentService.getComments(id, { limit: Math.min(limit, 100), offset });
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ limit: 10, ttl: 60 })
  async addComment(
    @Param('id') id: string,
    @Body('body') body: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.commentService.addComment(id, user, body);
  }

  @Post(':id/comments/:commentId/reply')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ limit: 10, ttl: 60 })
  async replyToComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body('body') body: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.commentService.addComment(id, user, body, commentId);
  }

  @Patch(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  async editComment(
    @Param('commentId') commentId: string,
    @Body('body') body: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.commentService.editComment(commentId, user._id.toString(), body);
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  async deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: UserDocument,
  ) {
    const isAdmin = [UserRole.ADMIN, UserRole.MODERATOR, UserRole.GROUP_ADMIN].includes((user as any).role);
    return this.commentService.deleteComment(commentId, user._id.toString(), isAdmin);
  }

  @Post(':id/comments/:commentId/like')
  @UseGuards(JwtAuthGuard)
  async likeComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.commentService.toggleLike(commentId, user._id.toString());
  }
}
