import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AccessTokenService } from '../../tokens/access-token.service';

export interface JwtPayload {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  scopes?: string[];
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: JwtPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly accessTokenService: AccessTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException({
        code: 'MISSING_TOKEN',
        message: 'No access token provided',
      });
    }

    try {
      const payload = await this.accessTokenService.verify(token);
      (request as AuthenticatedRequest).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
      });
    }
  }

  private extractTokenFromHeader(request: FastifyRequest): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
