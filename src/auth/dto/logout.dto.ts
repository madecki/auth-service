import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    description: 'Refresh token to revoke',
  })
  @IsString()
  @MinLength(1, { message: 'Refresh token is required' })
  refreshToken!: string;
}
