import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshTokenRepository } from './refresh-token.repository';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let repository: jest.Mocked<RefreshTokenRepository>;

  const mockRefreshToken = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: '223e4567-e89b-12d3-a456-426614174000',
    tokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() + 86400000), // 1 day from now
    revokedAt: null,
    createdAt: new Date(),
    replacedByTokenId: null,
    ip: '127.0.0.1',
    userAgent: 'test-agent',
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findByHash: jest.fn(),
      findValidByHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
      revokeTokenFamily: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: RefreshTokenRepository, useValue: mockRepository },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(2592000), // 30 days
          },
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RefreshTokenService>(RefreshTokenService);
    repository = module.get(RefreshTokenRepository);
  });

  describe('generate', () => {
    it('should generate a token and store its hash', async () => {
      repository.create.mockResolvedValue(mockRefreshToken);

      const result = await service.generate('user-id', { ip: '127.0.0.1' });

      expect(result.token).toBeDefined();
      expect(result.token.length).toBe(64); // nanoid length
      expect(result.refreshToken).toEqual(mockRefreshToken);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-id',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
          ip: '127.0.0.1',
        }),
      );
    });

    it('should hash the token (not store plaintext)', async () => {
      repository.create.mockResolvedValue(mockRefreshToken);

      const result = await service.generate('user-id');

      const createCall = repository.create.mock.calls[0][0];
      expect(createCall.tokenHash).not.toBe(result.token);
      expect(createCall.tokenHash).toHaveLength(64); // SHA-256 hex length
    });

    it('should set expiration based on config', async () => {
      repository.create.mockResolvedValue(mockRefreshToken);

      await service.generate('user-id');

      const createCall = repository.create.mock.calls[0][0];
      const expectedExpiry = Date.now() + 2592000 * 1000;
      const actualExpiry = createCall.expiresAt.getTime();

      // Allow 1 second tolerance
      expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(1000);
    });
  });

  describe('verify', () => {
    it('should return token record for valid token', async () => {
      repository.findByHash.mockResolvedValue(mockRefreshToken);

      const result = await service.verify('valid-token');

      expect(result).toEqual(mockRefreshToken);
    });

    it('should throw UnauthorizedException for unknown token', async () => {
      repository.findByHash.mockResolvedValue(null);

      await expect(service.verify('unknown-token')).rejects.toThrow(UnauthorizedException);
      await expect(service.verify('unknown-token')).rejects.toMatchObject({
        response: { code: 'INVALID_REFRESH_TOKEN' },
      });
    });

    it('should throw and revoke family for already revoked token (reuse attack)', async () => {
      const revokedToken = { ...mockRefreshToken, revokedAt: new Date() };
      repository.findByHash.mockResolvedValue(revokedToken);

      await expect(service.verify('reused-token')).rejects.toThrow(UnauthorizedException);
      await expect(service.verify('reused-token')).rejects.toMatchObject({
        response: { code: 'TOKEN_REUSED' },
      });
      expect(repository.revokeTokenFamily).toHaveBeenCalledWith(revokedToken.id);
    });

    it('should throw UnauthorizedException for expired token', async () => {
      const expiredToken = { ...mockRefreshToken, expiresAt: new Date(Date.now() - 1000) };
      repository.findByHash.mockResolvedValue(expiredToken);

      await expect(service.verify('expired-token')).rejects.toThrow(UnauthorizedException);
      await expect(service.verify('expired-token')).rejects.toMatchObject({
        response: { code: 'REFRESH_TOKEN_EXPIRED' },
      });
    });
  });

  describe('rotate', () => {
    it('should generate new token and revoke old one', async () => {
      repository.findByHash.mockResolvedValue(mockRefreshToken);
      repository.create.mockResolvedValue({
        ...mockRefreshToken,
        id: 'new-token-id',
      });

      const result = await service.rotate('old-token');

      expect(result.token).toBeDefined();
      expect(repository.revoke).toHaveBeenCalledWith(mockRefreshToken.id, 'new-token-id');
    });
  });

  describe('revoke', () => {
    it('should revoke existing token', async () => {
      repository.findByHash.mockResolvedValue(mockRefreshToken);

      await service.revoke('token-to-revoke');

      expect(repository.revoke).toHaveBeenCalledWith(mockRefreshToken.id);
    });

    it('should not throw for non-existent token', async () => {
      repository.findByHash.mockResolvedValue(null);

      await expect(service.revoke('unknown-token')).resolves.toBeUndefined();
    });

    it('should not revoke already revoked token', async () => {
      const revokedToken = { ...mockRefreshToken, revokedAt: new Date() };
      repository.findByHash.mockResolvedValue(revokedToken);

      await service.revoke('already-revoked');

      expect(repository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllForUser', () => {
    it('should call repository to revoke all user tokens', async () => {
      repository.revokeAllForUser.mockResolvedValue(5);

      const result = await service.revokeAllForUser('user-id');

      expect(result).toBe(5);
      expect(repository.revokeAllForUser).toHaveBeenCalledWith('user-id');
    });
  });
});
