import { Module } from '@nestjs/common';
import { DarajaService } from './daraja.service';
import { DarajaController } from './daraja.controller';
import { ConfigModule } from '@nestjs/config';
import { WalletModule } from '../../wallet/wallet.module';

@Module({
  imports: [ConfigModule, WalletModule],
  controllers: [DarajaController],
  providers: [DarajaService],
})
export class DarajaModule {}
