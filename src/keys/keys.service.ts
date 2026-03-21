import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as jose from 'jose';
import { nanoid } from 'nanoid';
import { Logger } from 'nestjs-pino';
import { EnvConfig } from '../config/env.validation';
import { KeysRepository } from './keys.repository';
import { KeyEncryptionService } from './key-encryption.service';
import { SigningKey } from '@prisma/client';

export interface JwkPublic {
  kty: string;
  n: string;
  e: string;
  alg: string;
  use: string;
  kid: string;
}

export interface JwksResponse {
  keys: JwkPublic[];
}

@Injectable()
export class KeysService implements OnModuleInit {
  private readonly algorithm = 'RS256';
  private readonly keyRotationEnabled: boolean;
  private cachedCurrentKey: { key: SigningKey; privateKey: jose.KeyLike } | null = null;

  constructor(
    private readonly keysRepository: KeysRepository,
    private readonly keyEncryption: KeyEncryptionService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly logger: Logger,
  ) {
    this.keyRotationEnabled = this.configService.get('KEY_ROTATION_ENABLED');
  }

  async onModuleInit(): Promise<void> {
    await this.ensureSigningKeyExists();
  }

  async ensureSigningKeyExists(): Promise<void> {
    const currentKey = await this.keysRepository.getCurrentSigningKey();

    if (!currentKey) {
      this.logger.log('No signing key found, generating initial key...');
      await this.rotateKey();
    }
  }

  async rotateKey(): Promise<SigningKey> {
    const kid = nanoid(16);

    // Generate RSA key pair
    const { publicKey, privateKey } = await jose.generateKeyPair(this.algorithm, {
      modulusLength: 2048,
    });

    // Export keys to JWK format
    const publicJwk = await jose.exportJWK(publicKey);
    const privateJwk = await jose.exportJWK(privateKey);

    // Add metadata to public JWK
    const publicJwkWithMeta: JwkPublic = {
      ...publicJwk,
      alg: this.algorithm,
      use: 'sig',
      kid,
    } as JwkPublic;

    // Encrypt private key for storage
    const privateKeyEncrypted = this.keyEncryption.encrypt(JSON.stringify(privateJwk));

    // Retire current key if exists
    const currentKey = await this.keysRepository.getCurrentSigningKey();
    if (currentKey) {
      await this.keysRepository.retireKey(currentKey.kid);
      this.logger.log({ kid: currentKey.kid }, 'Retired previous signing key');
    }

    // Create new key
    const newKey = await this.keysRepository.create({
      kid,
      publicJwk: publicJwkWithMeta as unknown as Record<string, string>,
      privateKeyEncrypted,
      algorithm: this.algorithm,
      isCurrent: true,
    });

    // Clear cache
    this.cachedCurrentKey = null;

    this.logger.log({ kid }, 'Generated new signing key');

    return newKey;
  }

  async getCurrentSigningKey(): Promise<{ key: SigningKey; privateKey: jose.KeyLike }> {
    if (this.cachedCurrentKey) {
      return this.cachedCurrentKey;
    }

    const key = await this.keysRepository.getCurrentSigningKey();

    if (!key || !key.privateKeyEncrypted) {
      throw new Error('No current signing key available');
    }

    const privateJwkJson = this.keyEncryption.decrypt(key.privateKeyEncrypted);
    const privateJwk = JSON.parse(privateJwkJson);
    const privateKey = (await jose.importJWK(privateJwk, this.algorithm)) as jose.KeyLike;

    this.cachedCurrentKey = { key, privateKey };

    // Update last used timestamp (fire and forget)
    this.keysRepository.updateLastUsed(key.kid).catch(() => {
      // Ignore errors
    });

    return this.cachedCurrentKey!;
  }

  async getPublicKeyByKid(kid: string): Promise<jose.KeyLike | null> {
    const key = await this.keysRepository.findByKid(kid);

    if (!key) {
      return null;
    }

    const publicJwk = key.publicJwk as unknown as jose.JWK;
    return (await jose.importJWK(publicJwk, this.algorithm)) as jose.KeyLike;
  }

  async getJwks(): Promise<JwksResponse> {
    // Include keys that are either active or recently retired
    // (within ACCESS_TOKEN_TTL to allow validation of existing tokens)
    const maxAge = this.configService.get('ACCESS_TOKEN_TTL_SECONDS') * 2;
    const keys = await this.keysRepository.getKeysForJwks(maxAge);

    return {
      keys: keys.map((k) => k.publicJwk as unknown as JwkPublic),
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleScheduledRotation(): Promise<void> {
    if (!this.keyRotationEnabled) {
      return;
    }

    const rotationIntervalHours = this.configService.get('KEY_ROTATION_INTERVAL_HOURS');
    const currentKey = await this.keysRepository.getCurrentSigningKey();

    if (!currentKey) {
      await this.rotateKey();
      return;
    }

    const keyAge = Date.now() - currentKey.createdAt.getTime();
    const rotationIntervalMs = rotationIntervalHours * 60 * 60 * 1000;

    if (keyAge > rotationIntervalMs) {
      this.logger.log('Scheduled key rotation triggered');
      await this.rotateKey();
    }
  }
}
