import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { DarajaService } from './daraja.service';

@Controller('wallet/mpesa')
export class DarajaController {
  constructor(private readonly darajaService: DarajaService) {}

  @Post('callback')
  async handleStkCallback(@Req() request: Request, @Body() body: any) {
    this.darajaService.validateCallbackRequest(request);
    return this.darajaService.handleStkCallback(body);
  }

  @Post('b2c-result')
  async handleB2CResult(@Req() request: Request, @Body() body: any) {
    this.darajaService.validateCallbackRequest(request);
    return this.darajaService.handleB2CResult(body);
  }

  @Post('b2c-timeout')
  async handleB2CTimeout(@Req() request: Request, @Body() body: any) {
    this.darajaService.validateCallbackRequest(request);
    return this.darajaService.handleB2CTimeout(body);
  }
}
