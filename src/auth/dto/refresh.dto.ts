import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description: 'Refresh token received from login or previous refresh',
  })
  @IsString()
  @MinLength(1, { message: 'Refresh token is required' })
  refreshToken!: string;
}
