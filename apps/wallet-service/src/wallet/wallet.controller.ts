import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard, CurrentUser, UserRole, Roles, RolesGuard, DepositDto, WithdrawDto } from '@app/common';
import { UserDocument } from '@app/database';
import { DarajaService } from '../payment-providers/daraja/daraja.service';
import { NowPaymentsService } from '../payment-providers/nowpayments/nowpayments.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly darajaService: DarajaService,
    private readonly nowPaymentsService: NowPaymentsService,
  ) {}

  @Get('balance')
  async getBalance(@CurrentUser() user: UserDocument) {
    return this.walletService.getBalance(user._id.toString());
  }

  @Get('transactions')
  async getTransactions(
    @CurrentUser() user: UserDocument,
    @Query('limit') limit: number,
    @Query('offset') offset: number,
  ) {
    return this.walletService.getTransactions(user._id.toString(), limit, offset);
  }

  @Get('limits')
  async getDailyLimits(@CurrentUser() user: UserDocument) {
    return this.walletService.getDailyLimits(user._id.toString());
  }

  // ─── User-facing deposit ──────────────────────────
  @Post('deposit')
  async deposit(@CurrentUser() user: UserDocument, @Body() depositDto: DepositDto) {
    if (depositDto.currency === 'KSH' && depositDto.phoneNumber) {
      // M-Pesa STK Push
      return this.darajaService.initiateStkPush(
        user._id.toString(),
        depositDto.phoneNumber,
        depositDto.amount,
      );
    }

    if (depositDto.currency === 'USD') {
      return this.nowPaymentsService.createPayment(user._id.toString(), depositDto.amount, 'USD');
    }

    return this.walletService.initiateDeposit(user._id.toString(), depositDto);
  }

  // ─── User-facing withdrawal ───────────────────────
  @Post('withdraw')
  async withdraw(@CurrentUser() user: UserDocument, @Body() withdrawDto: WithdrawDto) {
    return this.walletService.initiateWithdrawal(user._id.toString(), withdrawDto);
  }

  // ─── Admin endpoints ──────────────────────────────
  @Post('admin/credit')
  @Roles(UserRole.ADMIN)
  async adminCredit(@Body() body: { userId: string; amount: number; currency: string }) {
    return this.walletService.creditBalance(
      body.userId, 
      body.amount, 
      body.currency, 
      'Admin Credit', 
      'deposit'
    );
  }
}
