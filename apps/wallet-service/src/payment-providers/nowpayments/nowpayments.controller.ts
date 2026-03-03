import { Controller, Post, Body, Headers } from '@nestjs/common';
import { NowPaymentsService } from './nowpayments.service';

@Controller('wallet/crypto')
export class NowPaymentsController {
  constructor(private readonly nowPaymentsService: NowPaymentsService) {}

  // IPN callback (public — no auth guard, called by NOWPayments)
  @Post('ipn')
  @Post('callback')
  async handleIpn(
    @Body() body: any,
    @Headers('x-nowpayments-sig') signature: string,
  ) {
    return this.nowPaymentsService.handleIpnCallback(body, signature);
  }
}
