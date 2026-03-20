import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AccessTokenService } from '../tokens/access-token.service';
import { RefreshTokenService } from '../tokens/refresh-token.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let accessTokenService: jest.Mocked<AccessTokenService>;
  let refreshTokenService: jest.Mocked<RefreshTokenService>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRefreshTokenRecord = {
    id: 'token-id',
    userId: 'user-123',
    tokenHash: 'hashed',
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
    createdAt: new Date(),
    replacedByTokenId: null,
    ip: null,
    userAgent: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            createUser: jest.fn(),
            findByEmail: jest.fn(),
            findActiveById: jest.fn(),
            verifyPassword: jest.fn(),
          },
        },
        {
          provide: AccessTokenService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: RefreshTokenService,
          useValue: {
            generate: jest.fn(),
            rotate: jest.fn(),
            revoke: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    accessTokenService = module.get(AccessTokenService);
    refreshTokenService = module.get(RefreshTokenService);
  });

  describe('register', () => {
    it('should create user and return tokens', async () => {
      usersService.createUser.mockResolvedValue(mockUser);
      accessTokenService.sign.mockResolvedValue('access-token');
      refreshTokenService.generate.mockResolvedValue({
        token: 'refresh-token',
        refreshToken: mockRefreshTokenRecord,
      });

      const result = await service.register({
        email: 'test@example.com',
        password: 'SecurePassword123!',
      });

      expect(result).toEqual({
        userId: 'user-123',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(usersService.createUser).toHaveBeenCalledWith('test@example.com', 'SecurePassword123!');
    });

    it('should pass metadata to refresh token generation', async () => {
      usersService.createUser.mockResolvedValue(mockUser);
      accessTokenService.sign.mockResolvedValue('access-token');
      refreshTokenService.generate.mockResolvedValue({
        token: 'refresh-token',
        refreshToken: mockRefreshTokenRecord,
      });

      await service.register(
        { email: 'test@example.com', password: 'SecurePassword123!' },
        { ip: '127.0.0.1', userAgent: 'Test Browser' },
      );

      expect(refreshTokenService.generate).toHaveBeenCalledWith('user-123', {
        ip: '127.0.0.1',
        userAgent: 'Test Browser',
      });
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.verifyPassword.mockResolvedValue(true);
      accessTokenService.sign.mockResolvedValue('access-token');
      refreshTokenService.generate.mockResolvedValue({
        token: 'refresh-token',
        refreshToken: mockRefreshTokenRecord,
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'SecurePassword123!',
      });

      expect(result).toEqual({
        userId: 'user-123',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      usersService.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        service.login({ email: 'test@example.com', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.verifyPassword.mockResolvedValue(false);

      await expect(service.login({ email: 'test@example.com', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should use generic error message (no email enumeration)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      try {
        await service.login({ email: 'unknown@example.com', password: 'password' });
      } catch (error) {
        expect((error as UnauthorizedException).getResponse()).toMatchObject({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        });
      }
    });
  });

  describe('refresh', () => {
    it('should rotate tokens and return new pair', async () => {
      refreshTokenService.rotate.mockResolvedValue({
        token: 'new-refresh-token',
        refreshToken: mockRefreshTokenRecord,
      });
      accessTokenService.sign.mockResolvedValue('new-access-token');

      const result = await service.refresh('old-refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
      expect(refreshTokenService.rotate).toHaveBeenCalledWith('old-refresh-token', undefined);
    });
  });

  describe('logout', () => {
    it('should revoke refresh token', async () => {
      await service.logout('refresh-token');

      expect(refreshTokenService.revoke).toHaveBeenCalledWith('refresh-token');
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      usersService.findActiveById.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-123');

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        createdAt: mockUser.createdAt,
      });
    });

    it('should throw NotFoundException for non-existent user', async () => {
      usersService.findActiveById.mockResolvedValue(null);

      await expect(service.getProfile('unknown')).rejects.toThrow(NotFoundException);
    });
  });
});
