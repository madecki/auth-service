import { Injectable, ConflictException } from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { UsersRepository } from './users.repository';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

const MIN_PASSWORD_LENGTH = 10;

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async createUser(email: string, password: string): Promise<User> {
    this.validatePassword(password);

    const normalizedEmail = email.toLowerCase().trim();
    const exists = await this.usersRepository.existsByEmail(normalizedEmail);

    if (exists) {
      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await this.hashPassword(password);

    return this.usersRepository.create({
      email: normalizedEmail,
      passwordHash,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.usersRepository.findActiveById(id);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  private validatePassword(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ConflictException({
        code: 'WEAK_PASSWORD',
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
      });
    }
  }
}
