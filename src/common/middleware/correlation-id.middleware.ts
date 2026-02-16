import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';

const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): void {
    const correlationId = (req.headers[CORRELATION_ID_HEADER] as string | undefined) || nanoid(21);

    req.headers[CORRELATION_ID_HEADER] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
