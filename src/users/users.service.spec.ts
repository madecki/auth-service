import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<UsersRepository>;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findActiveById: jest.fn(),
      existsByEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: UsersRepository, useValue: mockRepository }],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(UsersRepository);
  });

  describe('createUser', () => {
    it('should create a user with hashed password', async () => {
      repository.existsByEmail.mockResolvedValue(false);
      repository.create.mockResolvedValue(mockUser);

      const result = await service.createUser('test@example.com', 'SecurePassword123!');

      expect(result).toEqual(mockUser);
      expect(repository.existsByEmail).toHaveBeenCalledWith('test@example.com');
      expect(repository.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        passwordHash: expect.stringContaining('$argon2id$'),
      });
    });

    it('should normalize email to lowercase', async () => {
      repository.existsByEmail.mockResolvedValue(false);
      repository.create.mockResolvedValue(mockUser);

      await service.createUser('TEST@EXAMPLE.COM', 'SecurePassword123!');

      expect(repository.existsByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should throw ConflictException if email exists', async () => {
      repository.existsByEmail.mockResolvedValue(true);

      await expect(service.createUser('test@example.com', 'SecurePassword123!')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for weak password with missing requirements', async () => {
      repository.existsByEmail.mockResolvedValue(false);

      const err = await service.createUser('test@example.com', 'short').catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      const response = err.getResponse() as {
        code: string;
        details?: { passwordRequirements: string[] };
      };
      expect(response.code).toBe('WEAK_PASSWORD');
      expect(Array.isArray(response.details?.passwordRequirements)).toBe(true);
      expect(response.details!.passwordRequirements.length).toBeGreaterThan(0);
    });

    it('should accept password meeting all criteria', async () => {
      repository.existsByEmail.mockResolvedValue(false);
      repository.create.mockResolvedValue(mockUser);

      await expect(
        service.createUser('test@example.com', 'SecurePassword123!'),
      ).resolves.toBeDefined();
    });
  });

  describe('verifyPassword', () => {
    it('should return true for valid password', async () => {
      // First create a hash
      repository.existsByEmail.mockResolvedValue(false);
      repository.create.mockImplementation(async (data) => ({
        ...mockUser,
        passwordHash: data.passwordHash,
      }));

      const user = await service.createUser('test@example.com', 'SecurePassword123!');
      const result = await service.verifyPassword('SecurePassword123!', user.passwordHash);

      expect(result).toBe(true);
    });

    it('should return false for invalid password', async () => {
      repository.existsByEmail.mockResolvedValue(false);
      repository.create.mockImplementation(async (data) => ({
        ...mockUser,
        passwordHash: data.passwordHash,
      }));

      const user = await service.createUser('test@example.com', 'SecurePassword123!');
      const result = await service.verifyPassword('WrongPassword123', user.passwordHash);

      expect(result).toBe(false);
    });

    it('should return false for malformed hash', async () => {
      const result = await service.verifyPassword('password', 'not-a-valid-hash');

      expect(result).toBe(false);
    });
  });

  describe('findByEmail', () => {
    it('should return user if found', async () => {
      repository.findByEmail.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
    });

    it('should return null if not found', async () => {
      repository.findByEmail.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findActiveById', () => {
    it('should return active user', async () => {
      repository.findActiveById.mockResolvedValue(mockUser);

      const result = await service.findActiveById(mockUser.id);

      expect(result).toEqual(mockUser);
    });

    it('should return null for inactive user', async () => {
      repository.findActiveById.mockResolvedValue(null);

      const result = await service.findActiveById(mockUser.id);

      expect(result).toBeNull();
    });
  });
});
