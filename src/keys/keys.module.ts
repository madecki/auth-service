import { Module } from '@nestjs/common';
import { KeysService } from './keys.service';
import { KeysRepository } from './keys.repository';
import { KeyEncryptionService } from './key-encryption.service';
import { KeysController } from './keys.controller';

@Module({
  controllers: [KeysController],
  providers: [KeysService, KeysRepository, KeyEncryptionService],
  exports: [KeysService],
})
export class KeysModule {}
