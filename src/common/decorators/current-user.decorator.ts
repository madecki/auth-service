import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, JwtPayload } from '../guards/jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (data) {
      return user[data];
    }
    return user;
  },
);
