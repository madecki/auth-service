import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  userId!: string;

  @ApiProperty({
    description: 'JWT access token (short-lived)',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Refresh token (long-lived, opaque string)',
  })
  refreshToken!: string;
}

export class TokenResponseDto {
  @ApiProperty({
    description: 'JWT access token (short-lived)',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'New refresh token (rotated)',
  })
  refreshToken!: string;
}

export class UserProfileDto {
  @ApiProperty({
    description: 'User ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Account creation timestamp',
  })
  createdAt!: Date;
}

export class LogoutResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Logged out successfully',
  })
  message!: string;
}
