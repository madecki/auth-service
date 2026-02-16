import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { EnvConfig } from '../../config/env.validation';
import * as crypto from 'crypto';

const SERVICE_TOKEN_HEADER = 'x-service-token';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const providedToken = request.headers[SERVICE_TOKEN_HEADER] as string | undefined;

    if (!providedToken) {
      throw new UnauthorizedException({
        code: 'MISSING_SERVICE_TOKEN',
        message: 'Internal service token required',
      });
    }

    const expectedToken = this.configService.get('INTERNAL_SERVICE_TOKEN');

    // Use timing-safe comparison to prevent timing attacks
    const providedBuffer = Buffer.from(providedToken, 'utf8');
    const expectedBuffer = Buffer.from(expectedToken, 'utf8');

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_SERVICE_TOKEN',
        message: 'Invalid internal service token',
      });
    }

    return true;
  }
}
