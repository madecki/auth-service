import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status: number;
    let errorResponse: ErrorResponse;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;

        // Handle validation errors from class-validator
        if (Array.isArray(resp.message)) {
          errorResponse = {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Validation failed',
              details: { errors: resp.message },
            },
          };
        } else {
          errorResponse = {
            error: {
              code: this.getErrorCode(status, resp),
              message: (resp.message as string) || exception.message,
              details: resp.details as Record<string, unknown> | undefined,
            },
          };
        }
      } else {
        errorResponse = {
          error: {
            code: this.getErrorCode(status),
            message: exceptionResponse as string,
          },
        };
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorResponse = {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
      };

      // Log unexpected errors
      this.logger.error(
        {
          exception,
          path: request.url,
          method: request.method,
          correlationId: request.headers['x-correlation-id'],
        },
        'Unhandled exception',
      );
    }

    response.status(status).send(errorResponse);
  }

  private getErrorCode(status: number, resp?: Record<string, unknown>): string {
    if (resp?.code) {
      return resp.code as string;
    }

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
