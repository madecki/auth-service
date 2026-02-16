import { Module } from '@nestjs/common';
import { WellKnownController } from './well-known.controller';
import { KeysModule } from '../keys/keys.module';

@Module({
  imports: [KeysModule],
  controllers: [WellKnownController],
})
export class WellKnownModule {}
