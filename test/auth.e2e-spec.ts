import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'SecurePassword123!',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.refreshToken.deleteMany({
      where: { user: { email: testUser.email.toLowerCase() } },
    });
    await prisma.user.deleteMany({
      where: { email: testUser.email.toLowerCase() },
    });
    await app.close();
  });

  describe('POST /v1/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(typeof response.body.accessToken).toBe('string');
      expect(typeof response.body.refreshToken).toBe('string');
    });

    it('should reject duplicate email', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(testUser)
        .expect(409);

      expect(response.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should reject weak password and return missing requirements', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: 'weak@example.com',
          password: 'short',
        })
        .expect(400);

      expect(response.body.error.code).toBe('WEAK_PASSWORD');
      expect(response.body.error.details).toBeDefined();
      expect(Array.isArray(response.body.error.details.passwordRequirements)).toBe(true);
      expect(response.body.error.details.passwordRequirements.length).toBeGreaterThan(0);
    });

    it('should reject invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SecurePassword123!',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(testUser)
        .expect(200);

      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should reject invalid password', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject non-existent email with generic error', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        })
        .expect(401);

      // Should not reveal that email doesn't exist
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /v1/auth/refresh', () => {
    let refreshToken: string;

    beforeAll(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(testUser);

      refreshToken = loginResponse.body.refreshToken;
    });

    it('should refresh tokens successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      // New refresh token should be different (rotated)
      expect(response.body.refreshToken).not.toBe(refreshToken);

      // Update for next test
      refreshToken = response.body.refreshToken;
    });

    it('should reject reused refresh token (one-time use)', async () => {
      // Get a fresh token
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(testUser);

      const originalToken = loginResponse.body.refreshToken;

      // Use it once
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: originalToken })
        .expect(200);

      // Try to use the same token again - should fail
      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: originalToken })
        .expect(401);

      expect(response.body.error.code).toBe('TOKEN_REUSED');
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('GET /v1/auth/me', () => {
    let accessToken: string;

    beforeAll(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(testUser);

      accessToken = loginResponse.body.accessToken;
    });

    it('should return user profile with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
      expect(response.body.email).toBe(testUser.email.toLowerCase());
      expect(response.body).toHaveProperty('createdAt');
    });

    it('should reject request without token', async () => {
      const response = await request(app.getHttpServer()).get('/v1/auth/me').expect(401);

      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('should logout successfully', async () => {
      // Login first
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(testUser);

      const refreshToken = loginResponse.body.refreshToken;

      // Logout
      const response = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.message).toBe('Logged out successfully');

      // Verify token is revoked
      const refreshResponse = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(refreshResponse.body.error.code).toBe('TOKEN_REUSED');
    });
  });

  describe('GET /.well-known/jwks.json', () => {
    it('should return JWKS', async () => {
      const response = await request(app.getHttpServer()).get('/.well-known/jwks.json').expect(200);

      expect(response.body).toHaveProperty('keys');
      expect(Array.isArray(response.body.keys)).toBe(true);
      expect(response.body.keys.length).toBeGreaterThan(0);

      const key = response.body.keys[0];
      expect(key).toHaveProperty('kty', 'RSA');
      expect(key).toHaveProperty('alg', 'RS256');
      expect(key).toHaveProperty('use', 'sig');
      expect(key).toHaveProperty('kid');
      expect(key).toHaveProperty('n');
      expect(key).toHaveProperty('e');
    });
  });

  describe('GET /.well-known/openid-configuration', () => {
    it('should return OpenID configuration', async () => {
      const response = await request(app.getHttpServer())
        .get('/.well-known/openid-configuration')
        .expect(200);

      expect(response.body).toHaveProperty('issuer');
      expect(response.body).toHaveProperty('jwks_uri');
      expect(response.body).toHaveProperty('token_endpoint');
      expect(response.body).toHaveProperty('id_token_signing_alg_values_supported');
      expect(response.body.id_token_signing_alg_values_supported).toContain('RS256');
    });
  });
});
