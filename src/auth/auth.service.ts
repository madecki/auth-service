import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AccessTokenService } from '../tokens/access-token.service';
import { RefreshTokenService, TokenMetadata } from '../tokens/refresh-token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto, TokenResponseDto, UserProfileDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly accessTokenService: AccessTokenService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto, metadata?: TokenMetadata): Promise<AuthResponseDto> {
    const user = await this.usersService.createUser(dto.email, dto.password);

    const [accessToken, { token: refreshToken }] = await Promise.all([
      this.accessTokenService.sign({ userId: user.id }),
      this.refreshTokenService.generate(user.id, metadata),
    ]);

    return {
      userId: user.id,
      accessToken,
      refreshToken,
    };
  }

  async login(dto: LoginDto, metadata?: TokenMetadata): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);

    // Generic error message to prevent email enumeration
    const invalidCredentialsError = new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });

    if (!user) {
      throw invalidCredentialsError;
    }

    if (!user.isActive) {
      throw invalidCredentialsError;
    }

    const isPasswordValid = await this.usersService.verifyPassword(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw invalidCredentialsError;
    }

    const [accessToken, { token: refreshToken }] = await Promise.all([
      this.accessTokenService.sign({ userId: user.id }),
      this.refreshTokenService.generate(user.id, metadata),
    ]);

    return {
      userId: user.id,
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string, metadata?: TokenMetadata): Promise<TokenResponseDto> {
    const { token: newRefreshToken, refreshToken: tokenRecord } =
      await this.refreshTokenService.rotate(refreshToken, metadata);

    const accessToken = await this.accessTokenService.sign({
      userId: tokenRecord.userId,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokenService.revoke(refreshToken);
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.usersService.findActiveById(userId);

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    };
  }
}
