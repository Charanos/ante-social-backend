import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { JwtAuthGuard, RolesGuard, Roles, UserRole, CurrentUser } from '@app/common';
import { UserDocument } from '@app/database';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  // ─── Dashboard & Users ─────────────────────────────
  @Get('dashboard')
  async getDashboard() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('analytics/overview')
  async getAnalyticsOverview() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('analytics/revenue')
  async getAnalyticsRevenue(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getRevenueMetrics(from, to);
  }

  @Get('analytics/users')
  async getAnalyticsUsers(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getUserMetrics(from, to);
  }

  @Get('analytics/markets')
  async getAnalyticsMarkets(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getMarketMetrics(from, to);
  }

  @Get('users')
  async getUsers(
    @Query('limit') limit: number,
    @Query('offset') offset: number,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('tier') tier?: string,
  ) {
    return this.adminService.getUsers(limit, offset, search, role, tier);
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @CurrentUser() admin: UserDocument) {
    return this.adminService.deleteUser(id, admin._id.toString());
  }

  @Post('users/:id/ban')
  async banUser(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.adminService.banUser(id, reason);
  }

  @Post('users/:id/unban')
  async unbanUser(@Param('id') id: string) {
    return this.adminService.unbanUser(id);
  }

  @Patch('users/:userId/tier')
  async updateTier(
    @Param('userId') userId: string,
    @Body('tier') tier: string,
  ) {
    return this.adminService.updateUserTier(userId, tier);
  }

  // ─── Compliance ────────────────────────────────────
  @Get('compliance/flags')
  async getComplianceFlags(
    @Query('status') status?: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.adminService.getComplianceFlags(status, Number(limit), Number(offset));
  }

  @Post('compliance/freeze')
  async freezeAccount(
    @Body('userId') userId: string,
    @Body('reason') reason: string,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.freezeAccount(userId, reason, admin._id.toString());
  }

  @Post('compliance/unfreeze')
  async unfreezeAccount(
    @Body('userId') userId: string,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.unfreezeAccount(userId, admin._id.toString());
  }

  @Patch('compliance/flags/:id/resolve')
  async resolveComplianceFlag(
    @Param('id') id: string,
    @Body('notes') notes: string | undefined,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.resolveComplianceFlag(id, notes, admin._id.toString());
  }

  @Patch('compliance/flags/:id/escalate')
  async escalateComplianceFlag(
    @Param('id') id: string,
    @Body('notes') notes: string | undefined,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.escalateComplianceFlag(id, notes, admin._id.toString());
  }

  @Post('compliance/flags/:id/notes')
  async addComplianceFlagNote(
    @Param('id') id: string,
    @Body('note') note: string,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.addComplianceFlagNote(id, note, admin._id.toString());
  }

  // ─── Withdrawal Approval ──────────────────────────
  @Get('withdrawals')
  async getPendingWithdrawals(@Query('limit') limit = 20, @Query('offset') offset = 0) {
    return this.adminService.getPendingWithdrawals(Number(limit), Number(offset));
  }

  @Post('withdrawals/:id/approve')
  async approveWithdrawal(
    @Param('id') id: string,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.approveWithdrawal(id, admin._id.toString());
  }

  @Post('withdrawals/:id/reject')
  async rejectWithdrawal(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.rejectWithdrawal(id, reason, admin._id.toString());
  }

  @Get('markets/recurring')
  async getRecurringMarkets(@Query('limit') limit = 20, @Query('offset') offset = 0) {
    return this.adminService.getRecurringMarketTemplates(Number(limit), Number(offset));
  }

  @Post('markets/recurring')
  async createRecurringMarket(
    @Body() body: Record<string, unknown>,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.createRecurringMarketTemplate(body, admin._id.toString());
  }

  @Patch('markets/recurring/:id')
  async updateRecurringMarket(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.updateRecurringMarketTemplate(id, body, admin._id.toString());
  }

  @Delete('markets/recurring/:id')
  async deleteRecurringMarket(@Param('id') id: string, @CurrentUser() admin: UserDocument) {
    return this.adminService.deleteRecurringMarketTemplate(id, admin._id.toString());
  }

  @Get('audit-logs')
  async getAuditLogs(
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
    @Query('action') action?: string,
  ) {
    return this.adminService.getAuditLogs(Number(limit), Number(offset), action);
  }

  @Get('maintenance/tasks')
  async getMaintenanceTasks() {
    return this.adminService.getMaintenanceTasks();
  }

  @Post('maintenance/:taskId/run')
  async runMaintenanceTask(
    @Param('taskId') taskId: string,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.runMaintenanceTask(taskId, admin._id.toString());
  }

  // ─── Blog CRUD ─────────────────────────────────────
  @Get('blogs')
  async getBlogs(
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
    @Query('status') status?: string,
  ) {
    return this.adminService.getBlogs(Number(limit), Number(offset), status);
  }

  @Get('blogs/:id')
  async getBlogById(@Param('id') id: string) {
    return this.adminService.getBlogById(id);
  }

  @Post('blogs')
  async createBlog(
    @Body() body: Record<string, unknown>,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.createBlog(body, admin._id.toString());
  }

  @Patch('blogs/:id')
  async updateBlog(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.updateBlog(id, body, admin._id.toString());
  }

  @Delete('blogs/:id')
  async deleteBlog(@Param('id') id: string, @CurrentUser() admin: UserDocument) {
    return this.adminService.deleteBlog(id, admin._id.toString());
  }

  // ─── Newsletter ────────────────────────────────────
  @Get('newsletter/subscribers')
  async getNewsletterSubscribers(
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.adminService.getNewsletterSubscribers(Number(limit), Number(offset));
  }

  // ─── Landing Page CMS ─────────────────────────────
  @Get('content/landing-page')
  async getLandingPageSettings() {
    return this.adminService.getLandingPageSettings();
  }

  @Patch('content/landing-page')
  async updateLandingPageSettings(
    @Body() body: Record<string, unknown>,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.adminService.updateLandingPageSettings(body, admin._id.toString());
  }

  // ─── Leaderboard (public via admin-service) ────────
  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limit = 10) {
    return this.adminService.getLeaderboard(Number(limit));
  }
}

// ─── Public Controller (no auth guards) ──────────────
@Controller('public')
export class PublicController {
  constructor(private readonly adminService: AdminService) {}

  @Post('newsletter/subscribe')
  async subscribeNewsletter(@Body('email') email: string) {
    return this.adminService.subscribeNewsletter(email);
  }

  @Get('content/landing-page')
  async getLandingPageSettings() {
    return this.adminService.getLandingPageSettings();
  }

  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limit = 10) {
    return this.adminService.getLeaderboard(Number(limit));
  }

  @Get('blogs')
  async getPublishedBlogs(
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.adminService.getBlogs(Number(limit), Number(offset), 'published');
  }

  @Get('blogs/:slug')
  async getBlogBySlug(@Param('slug') slug: string) {
    return this.adminService.getBlogBySlug(slug);
  }

  @Post('blogs/:slug/view')
  async incrementBlogViews(@Param('slug') slug: string) {
    return this.adminService.incrementBlogViews(slug);
  }
}
