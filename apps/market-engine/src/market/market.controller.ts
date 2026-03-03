import { Controller, Get, Post, Body, Param, Query, UseGuards, Put, Patch, Delete } from '@nestjs/common';
import { MarketService } from './market.service';
import { CreateMarketDto, JwtAuthGuard, CurrentUser, Roles, UserRole, RolesGuard } from '@app/common';
import { UserDocument } from '@app/database';

@Controller('markets')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

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
}
