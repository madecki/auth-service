import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { nanoid } from 'nanoid';
import { Logger } from 'nestjs-pino';
import { RefreshToken } from '@prisma/client';
import { EnvConfig } from '../config/env.validation';
import { RefreshTokenRepository } from './refresh-token.repository';

const TOKEN_LENGTH = 64; // Length of the opaque refresh token

export interface RefreshTokenResult {
  token: string;
  refreshToken: RefreshToken;
}

export interface TokenMetadata {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class RefreshTokenService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly logger: Logger,
  ) {
    this.ttlSeconds = this.configService.get('REFRESH_TOKEN_TTL_SECONDS');
  }

  async generate(userId: string, metadata?: TokenMetadata): Promise<RefreshTokenResult> {
    const token = nanoid(TOKEN_LENGTH);
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const refreshToken = await this.refreshTokenRepository.create({
      userId,
      tokenHash,
      expiresAt,
      ip: metadata?.ip,
      userAgent: metadata?.userAgent,
    });

    return { token, refreshToken };
  }

  async verify(token: string): Promise<RefreshToken> {
    const tokenHash = this.hashToken(token);
    const refreshToken = await this.refreshTokenRepository.findByHash(tokenHash);

    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      });
    }

    // Check if token was already revoked (possible token reuse attack)
    if (refreshToken.revokedAt) {
      this.logger.warn(
        { userId: refreshToken.userId, tokenId: refreshToken.id },
        'Refresh token reuse detected, revoking token family',
      );

      // Revoke entire token family - security measure against token theft
      await this.refreshTokenRepository.revokeTokenFamily(refreshToken.id);

      throw new UnauthorizedException({
        code: 'TOKEN_REUSED',
        message: 'Refresh token has already been used',
      });
    }

    // Check expiration
    if (refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token has expired',
      });
    }

    return refreshToken;
  }

  async rotate(oldToken: string, metadata?: TokenMetadata): Promise<RefreshTokenResult> {
    const oldRefreshToken = await this.verify(oldToken);

    // Generate new token
    const { token: newToken, refreshToken: newRefreshToken } = await this.generate(
      oldRefreshToken.userId,
      metadata,
    );

    // Revoke old token and link to new one
    await this.refreshTokenRepository.revoke(oldRefreshToken.id, newRefreshToken.id);

    return { token: newToken, refreshToken: newRefreshToken };
  }

  async revoke(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const refreshToken = await this.refreshTokenRepository.findByHash(tokenHash);

    if (refreshToken && !refreshToken.revokedAt) {
      await this.refreshTokenRepository.revoke(refreshToken.id);
    }
  }

  async revokeAllForUser(userId: string): Promise<number> {
    return this.refreshTokenRepository.revokeAllForUser(userId);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
