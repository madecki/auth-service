import { Controller, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiExcludeController,
} from '@nestjs/swagger';
import { KeysService } from './keys.service';
import { InternalServiceGuard } from '../common/guards/internal-service.guard';

@ApiExcludeController()
@ApiTags('internal')
@Controller('internal/keys')
export class KeysController {
  constructor(private readonly keysService: KeysService) {}

  @Post('rotate')
  @UseGuards(InternalServiceGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate signing keys (internal use only)' })
  @ApiHeader({
    name: 'x-service-token',
    description: 'Internal service authentication token',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Key rotated successfully',
    schema: {
      type: 'object',
      properties: {
        kid: { type: 'string', description: 'New key ID' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing service token' })
  async rotateKey(): Promise<{ kid: string; message: string }> {
    const newKey = await this.keysService.rotateKey();

    return {
      kid: newKey.kid,
      message: 'Key rotated successfully',
    };
  }
}
