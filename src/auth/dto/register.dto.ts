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
    example: 'securePassword123',
    description: 'Password (minimum 10 characters)',
    minLength: 10,
  })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  password!: string;
}
