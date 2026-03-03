import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@app/database';
import { validateEnv } from '@app/common';
import { AuthModule } from './auth/auth.module';
import { TwoFactorModule } from './two-factor/two-factor.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    AuthModule,
    TwoFactorModule,
    UserModule,
  ],
})
export class AppModule {}

