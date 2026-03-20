import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({
    example: 'SecurePassword123!',
    description: 'Password (min 10 chars, upper, lower, digit, special)',
  })
  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}
