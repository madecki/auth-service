import { Injectable } from '@nestjs/common';
import { RefreshToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateRefreshTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRefreshTokenData): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        ip: data.ip,
        userAgent: data.userAgent,
      },
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
  }

  async findValidByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async revoke(id: string, replacedByTokenId?: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        replacedByTokenId,
      },
    });
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count;
  }

  async revokeTokenFamily(tokenId: string): Promise<void> {
    // Find all tokens in this rotation chain and revoke them
    // This prevents token reuse attacks
    const tokensToRevoke = await this.findTokenFamily(tokenId);

    if (tokensToRevoke.length > 0) {
      await this.prisma.refreshToken.updateMany({
        where: {
          id: { in: tokensToRevoke.map((t) => t.id) },
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }
  }

  private async findTokenFamily(tokenId: string): Promise<RefreshToken[]> {
    const tokens: RefreshToken[] = [];
    let currentId: string | null = tokenId;

    // Find the root of the chain (go backwards)
    while (currentId) {
      const token = await this.prisma.refreshToken.findUnique({
        where: { id: currentId },
      });

      if (!token) break;

      // Find token that was replaced by this one
      const parent: RefreshToken | null = await this.prisma.refreshToken.findFirst({
        where: { replacedByTokenId: currentId },
      });

      if (parent) {
        currentId = parent.id;
      } else {
        break;
      }
    }

    // Now traverse forward and collect all tokens
    let current: RefreshToken | null = currentId
      ? await this.prisma.refreshToken.findUnique({ where: { id: currentId } })
      : null;

    while (current) {
      tokens.push(current);

      if (current.replacedByTokenId) {
        current = await this.prisma.refreshToken.findUnique({
          where: { id: current.replacedByTokenId },
        });
      } else {
        break;
      }
    }

    return tokens;
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return result.count;
  }
}
