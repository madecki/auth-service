import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { KeysService, JwksResponse } from '../keys/keys.service';
import { EnvConfig } from '../config/env.validation';

interface OpenIdConfiguration {
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
  authorization_endpoint: string | null;
  response_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

@ApiTags('well-known')
@Controller('.well-known')
export class WellKnownController {
  private readonly issuer: string;

  constructor(
    private readonly keysService: KeysService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {
    this.issuer = this.configService.get('JWT_ISSUER');
  }

  @Get('jwks.json')
  @ApiOperation({ summary: 'Get JSON Web Key Set (JWKS)' })
  @ApiResponse({
    status: 200,
    description: 'Returns public keys for JWT verification',
    schema: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kty: { type: 'string', example: 'RSA' },
              n: { type: 'string' },
              e: { type: 'string' },
              alg: { type: 'string', example: 'RS256' },
              use: { type: 'string', example: 'sig' },
              kid: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getJwks(): Promise<JwksResponse> {
    return this.keysService.getJwks();
  }

  @Get('openid-configuration')
  @ApiOperation({ summary: 'Get OpenID Connect discovery document' })
  @ApiResponse({
    status: 200,
    description: 'Returns OpenID Connect configuration',
    schema: {
      type: 'object',
      properties: {
        issuer: { type: 'string' },
        jwks_uri: { type: 'string' },
        token_endpoint: { type: 'string' },
        authorization_endpoint: { type: 'string', nullable: true },
        response_types_supported: { type: 'array', items: { type: 'string' } },
        subject_types_supported: { type: 'array', items: { type: 'string' } },
        id_token_signing_alg_values_supported: { type: 'array', items: { type: 'string' } },
        token_endpoint_auth_methods_supported: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  getOpenIdConfiguration(): OpenIdConfiguration {
    return {
      issuer: this.issuer,
      jwks_uri: `${this.issuer}/.well-known/jwks.json`,
      token_endpoint: `${this.issuer}/v1/auth/login`,
      authorization_endpoint: null, // Not implementing full OAuth2/OIDC authorization flow
      response_types_supported: ['token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    };
  }
}
