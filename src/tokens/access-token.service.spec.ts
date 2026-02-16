import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';
import { SigningKey } from '@prisma/client';
import { AccessTokenService } from './access-token.service';
import { KeysService } from '../keys/keys.service';

describe('AccessTokenService', () => {
  let service: AccessTokenService;
  let keysService: jest.Mocked<KeysService>;

  const mockKid = 'test-key-id';
  let mockKeyPair: { publicKey: jose.KeyLike; privateKey: jose.KeyLike };

  beforeAll(async () => {
    // Generate a real key pair for testing
    const keyPair = await jose.generateKeyPair('RS256');
    mockKeyPair = keyPair;
  });

  beforeEach(async () => {
    const mockKeysService = {
      getCurrentSigningKey: jest.fn(),
      getPublicKeyByKid: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessTokenService,
        { provide: KeysService, useValue: mockKeysService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'JWT_ISSUER':
                  return 'http://test-issuer';
                case 'JWT_AUDIENCE':
                  return 'test-audience';
                case 'ACCESS_TOKEN_TTL_SECONDS':
                  return 900;
                default:
                  return undefined;
              }
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AccessTokenService>(AccessTokenService);
    keysService = module.get(KeysService);
  });

  describe('sign', () => {
    it('should sign a JWT with correct claims', async () => {
      keysService.getCurrentSigningKey.mockResolvedValue({
        key: { kid: mockKid } as SigningKey,
        privateKey: mockKeyPair.privateKey,
      });

      const token = await service.sign({ userId: 'user-123' });

      // Decode without verification to check structure
      const decoded = jose.decodeJwt(token);
      expect(decoded.sub).toBe('user-123');
      expect(decoded.iss).toBe('http://test-issuer');
      expect(decoded.aud).toBe('test-audience');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should include kid in header', async () => {
      keysService.getCurrentSigningKey.mockResolvedValue({
        key: { kid: mockKid } as SigningKey,
        privateKey: mockKeyPair.privateKey,
      });

      const token = await service.sign({ userId: 'user-123' });

      const header = jose.decodeProtectedHeader(token);
      expect(header.kid).toBe(mockKid);
      expect(header.alg).toBe('RS256');
    });

    it('should include scopes if provided', async () => {
      keysService.getCurrentSigningKey.mockResolvedValue({
        key: { kid: mockKid } as SigningKey,
        privateKey: mockKeyPair.privateKey,
      });

      const token = await service.sign({
        userId: 'user-123',
        scopes: ['read', 'write'],
      });

      const decoded = jose.decodeJwt(token);
      expect(decoded.scopes).toEqual(['read', 'write']);
    });

    it('should set correct expiration', async () => {
      keysService.getCurrentSigningKey.mockResolvedValue({
        key: { kid: mockKid } as SigningKey,
        privateKey: mockKeyPair.privateKey,
      });

      const beforeSign = Math.floor(Date.now() / 1000);
      const token = await service.sign({ userId: 'user-123' });
      const afterSign = Math.floor(Date.now() / 1000);

      const decoded = jose.decodeJwt(token);
      const expectedExpMin = beforeSign + 900;
      const expectedExpMax = afterSign + 900;

      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExpMin);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpMax);
    });
  });

  describe('verify', () => {
    it('should verify a valid token', async () => {
      keysService.getCurrentSigningKey.mockResolvedValue({
        key: { kid: mockKid } as SigningKey,
        privateKey: mockKeyPair.privateKey,
      });
      keysService.getPublicKeyByKid.mockResolvedValue(mockKeyPair.publicKey);

      const token = await service.sign({ userId: 'user-123' });
      const payload = await service.verify(token);

      expect(payload.sub).toBe('user-123');
      expect(payload.iss).toBe('http://test-issuer');
      expect(payload.aud).toBe('test-audience');
    });

    it('should throw for token without kid', async () => {
      // Create a token without kid
      const tokenWithoutKid = await new jose.SignJWT({ sub: 'user-123' })
        .setProtectedHeader({ alg: 'RS256' }) // No kid
        .setIssuer('http://test-issuer')
        .setAudience('test-audience')
        .setExpirationTime('15m')
        .sign(mockKeyPair.privateKey);

      await expect(service.verify(tokenWithoutKid)).rejects.toThrow('Token missing kid in header');
    });

    it('should throw for unknown kid', async () => {
      keysService.getCurrentSigningKey.mockResolvedValue({
        key: { kid: mockKid } as SigningKey,
        privateKey: mockKeyPair.privateKey,
      });
      keysService.getPublicKeyByKid.mockResolvedValue(null);

      const token = await service.sign({ userId: 'user-123' });

      await expect(service.verify(token)).rejects.toThrow('Unknown signing key');
    });

    it('should throw for expired token', async () => {
      keysService.getPublicKeyByKid.mockResolvedValue(mockKeyPair.publicKey);

      // Create an expired token
      const expiredToken = await new jose.SignJWT({ sub: 'user-123' })
        .setProtectedHeader({ alg: 'RS256', kid: mockKid })
        .setIssuer('http://test-issuer')
        .setAudience('test-audience')
        .setExpirationTime('-1s') // Already expired
        .sign(mockKeyPair.privateKey);

      await expect(service.verify(expiredToken)).rejects.toThrow();
    });

    it('should throw for wrong issuer', async () => {
      keysService.getPublicKeyByKid.mockResolvedValue(mockKeyPair.publicKey);

      const wrongIssuerToken = await new jose.SignJWT({ sub: 'user-123' })
        .setProtectedHeader({ alg: 'RS256', kid: mockKid })
        .setIssuer('http://wrong-issuer')
        .setAudience('test-audience')
        .setExpirationTime('15m')
        .sign(mockKeyPair.privateKey);

      await expect(service.verify(wrongIssuerToken)).rejects.toThrow();
    });

    it('should throw for wrong audience', async () => {
      keysService.getPublicKeyByKid.mockResolvedValue(mockKeyPair.publicKey);

      const wrongAudienceToken = await new jose.SignJWT({ sub: 'user-123' })
        .setProtectedHeader({ alg: 'RS256', kid: mockKid })
        .setIssuer('http://test-issuer')
        .setAudience('wrong-audience')
        .setExpirationTime('15m')
        .sign(mockKeyPair.privateKey);

      await expect(service.verify(wrongAudienceToken)).rejects.toThrow();
    });

    it('should throw for tampered token', async () => {
      keysService.getCurrentSigningKey.mockResolvedValue({
        key: { kid: mockKid } as SigningKey,
        privateKey: mockKeyPair.privateKey,
      });
      keysService.getPublicKeyByKid.mockResolvedValue(mockKeyPair.publicKey);

      const token = await service.sign({ userId: 'user-123' });

      // Tamper with the payload
      const parts = token.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'hacker' })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      await expect(service.verify(tamperedToken)).rejects.toThrow();
    });
  });
});
