import { Controller, Get, Post, Body, Param, UseGuards, Query, Patch, Delete } from '@nestjs/common';
import { GroupService } from './group.service';
import { JwtAuthGuard, CurrentUser } from '@app/common';
import { UserDocument } from '@app/database';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  // ─── Group Management ─────────────────────────────
  @Post()
  async createGroup(
    @Body() data: { name: string; description?: string; isPublic?: boolean },
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.createGroup(data, user._id.toString());
  }

  @Get()
  async getGroups(
    @Query('search') search?: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.groupService.searchGroups(search, Number(limit), Number(offset));
  }

  @Get(':id')
  async getGroup(@Param('id') id: string) {
    return this.groupService.getGroup(id);
  }

  @Post(':id/join')
  async joinGroup(
    @Param('id') id: string,
    @Body('inviteCode') inviteCode: string | undefined,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.joinGroup(id, user._id.toString(), inviteCode);
  }

  @Post(':id/leave')
  async leaveGroup(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.groupService.leaveGroup(id, user._id.toString());
  }

  @Patch(':id')
  async updateGroup(
    @Param('id') id: string,
    @Body()
    data: {
      name?: string;
      description?: string;
      category?: string;
      isPublic?: boolean;
      imageUrl?: string;
    },
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.updateGroup(id, data, user._id.toString());
  }

  @Delete(':id')
  async deleteGroup(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.groupService.deleteGroup(id, user._id.toString());
  }

  @Patch(':id/members/:memberId/role')
  async updateMemberRole(
    @Param('id') groupId: string,
    @Param('memberId') memberId: string,
    @Body('role') role: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.updateMemberRole(groupId, memberId, role, user._id.toString());
  }

  @Post(':id/members/:memberId/remove')
  async removeMember(
    @Param('id') groupId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.removeMember(groupId, memberId, user._id.toString());
  }

  @Post(':id/invite')
  async inviteMember(
    @Param('id') groupId: string,
    @Body('invitee') invitee: string | undefined,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.createInvite(groupId, user._id.toString(), invitee);
  }

  // ─── Group Markets ─────────────────────────────────
  @Post(':id/markets')
  async createMarket(
    @Param('id') groupId: string,
    @Body() data: any,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.createGroupBet(groupId, data, user._id.toString());
  }

  @Get(':id/markets')
  async getGroupMarkets(@Param('id') groupId: string) {
    return this.groupService.getGroupBets(groupId);
  }

  @Post(':id/markets/:marketId/close')
  async closeGroupMarket(
    @Param('id') groupId: string,
    @Param('marketId') marketId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.closeGroupBet(groupId, marketId, user._id.toString());
  }

  @Delete(':id/markets/:marketId')
  async deleteGroupMarket(
    @Param('id') groupId: string,
    @Param('marketId') marketId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.deleteGroupBet(groupId, marketId, user._id.toString());
  }

  @Post('markets/:marketId/join')
  async joinMarket(
    @Param('marketId') marketId: string,
    @Body('selectedOption') selectedOption: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.joinBet(marketId, selectedOption, user._id.toString());
  }

  @Post('markets/:marketId/declare')
  async declareMarketOutcome(
    @Param('marketId') marketId: string,
    @Body('winnerId') winnerId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.declareWinner(marketId, winnerId, user._id.toString());
  }

  @Post('markets/:marketId/confirm')
  async confirmMarketOutcome(
    @Param('marketId') marketId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.confirmResult(marketId, user._id.toString());
  }

  @Post('markets/:marketId/disagree')
  async disagreeMarketOutcome(
    @Param('marketId') marketId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.groupService.disagreeResult(marketId, user._id.toString());
  }

}
