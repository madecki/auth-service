import { Injectable } from '@nestjs/common';
import { Prisma, SigningKey, SigningKeyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateKeyData {
  kid: string;
  publicJwk: Prisma.InputJsonValue;
  privateKeyEncrypted: string;
  algorithm: string;
  isCurrent: boolean;
}

@Injectable()
export class KeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateKeyData): Promise<SigningKey> {
    return this.prisma.signingKey.create({
      data: {
        kid: data.kid,
        publicJwk: data.publicJwk,
        privateKeyEncrypted: data.privateKeyEncrypted,
        algorithm: data.algorithm,
        isCurrent: data.isCurrent,
        status: SigningKeyStatus.ACTIVE,
      },
    });
  }

  async getCurrentSigningKey(): Promise<SigningKey | null> {
    return this.prisma.signingKey.findFirst({
      where: {
        isCurrent: true,
        status: SigningKeyStatus.ACTIVE,
      },
    });
  }

  async findByKid(kid: string): Promise<SigningKey | null> {
    return this.prisma.signingKey.findUnique({
      where: { kid },
    });
  }

  async getActiveKeys(): Promise<SigningKey[]> {
    return this.prisma.signingKey.findMany({
      where: {
        status: SigningKeyStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getKeysForJwks(maxAgeSeconds: number): Promise<SigningKey[]> {
    const cutoffDate = new Date(Date.now() - maxAgeSeconds * 1000);

    return this.prisma.signingKey.findMany({
      where: {
        OR: [
          { status: SigningKeyStatus.ACTIVE },
          {
            status: SigningKeyStatus.RETIRED,
            retiredAt: { gte: cutoffDate },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setCurrentKey(kid: string): Promise<void> {
    await this.prisma.$transaction([
      // Remove current flag from all keys
      this.prisma.signingKey.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      }),
      // Set new current key
      this.prisma.signingKey.update({
        where: { kid },
        data: { isCurrent: true },
      }),
    ]);
  }

  async retireKey(kid: string): Promise<void> {
    await this.prisma.signingKey.update({
      where: { kid },
      data: {
        status: SigningKeyStatus.RETIRED,
        retiredAt: new Date(),
        isCurrent: false,
      },
    });
  }

  async updateLastUsed(kid: string): Promise<void> {
    await this.prisma.signingKey.update({
      where: { kid },
      data: { lastUsedAt: new Date() },
    });
  }

  async countActiveKeys(): Promise<number> {
    return this.prisma.signingKey.count({
      where: { status: SigningKeyStatus.ACTIVE },
    });
  }
}
