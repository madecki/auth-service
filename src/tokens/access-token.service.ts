import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';
import { EnvConfig } from '../config/env.validation';
import { KeysService } from '../keys/keys.service';
import { JwtPayload } from '../common/guards/jwt-auth.guard';

export interface AccessTokenClaims {
  userId: string;
  scopes?: string[];
}

@Injectable()
export class AccessTokenService {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly keysService: KeysService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {
    this.issuer = this.configService.get('JWT_ISSUER');
    this.audience = this.configService.get('JWT_AUDIENCE');
    this.ttlSeconds = this.configService.get('ACCESS_TOKEN_TTL_SECONDS');
  }

  async sign(claims: AccessTokenClaims): Promise<string> {
    const { key, privateKey } = await this.keysService.getCurrentSigningKey();

    const jwt = await new jose.SignJWT({
      scopes: claims.scopes || [],
    })
      .setProtectedHeader({ alg: 'RS256', kid: key.kid })
      .setSubject(claims.userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(privateKey);

    return jwt;
  }

  async verify(token: string): Promise<JwtPayload> {
    // Extract the kid from the token header to get the correct key
    const { kid } = jose.decodeProtectedHeader(token);

    if (!kid) {
      throw new Error('Token missing kid in header');
    }

    const publicKey = await this.keysService.getPublicKeyByKid(kid);

    if (!publicKey) {
      throw new Error('Unknown signing key');
    }

    const { payload } = await jose.jwtVerify(token, publicKey, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ['RS256'],
    });

    return {
      sub: payload.sub as string,
      iss: payload.iss as string,
      aud: payload.aud as string,
      iat: payload.iat as number,
      exp: payload.exp as number,
      scopes: payload.scopes as string[] | undefined,
    };
  }
}
