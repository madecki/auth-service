import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { KeysModule } from './keys/keys.module';
import { TokensModule } from './tokens/tokens.module';
import { AuthModule } from './auth/auth.module';
import { WellKnownModule } from './well-known/well-known.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                },
              }
            : undefined,
        autoLogging: true,
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            correlationId: req.headers?.['x-correlation-id'],
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
        customProps: (req) => ({
          correlationId: req.headers?.['x-correlation-id'],
        }),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers["x-service-token"]',
            'req.body.password',
            'req.body.refreshToken',
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    KeysModule,
    TokensModule,
    AuthModule,
    WellKnownModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
