import { Module } from '@nestjs/common';
import { AccessTokenService } from './access-token.service';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { KeysModule } from '../keys/keys.module';

@Module({
  imports: [KeysModule],
  providers: [AccessTokenService, RefreshTokenService, RefreshTokenRepository],
  exports: [AccessTokenService, RefreshTokenService],
})
export class TokensModule {}
