# Auth Service

Production-ready authentication service with JWT (RS256), refresh token rotation, and JWKS endpoint.

## Features

- **User Registration & Login** - Email/password authentication with Argon2id password hashing
- **JWT Access Tokens** - RS256 signed, short-lived (15 min default), with `kid` header for key identification
- **Refresh Token Rotation** - Opaque tokens, hashed in DB, one-time use with automatic token family revocation
- **JWKS Endpoint** - Public keys for JWT verification by API gateways and services
- **Key Rotation** - Support for multiple active signing keys with graceful rotation
- **Security** - Helmet, rate limiting, correlation IDs, structured logging with redaction
- **OpenAPI/Swagger** - Full API documentation

## Tech Stack

- Node.js 20+
- NestJS with Fastify adapter
- PostgreSQL + Prisma ORM
- TypeScript
- Jest + Supertest for testing

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker & Docker Compose

### Setup

1. **Clone and install dependencies**

```bash
pnpm install
```

2. **Configure environment**

```bash
cp .env.example .env
```

Edit `.env` and set required secrets:

```bash
# Generate encryption secret
openssl rand -base64 32

# Generate internal service token
openssl rand -hex 32
```

3. **Start everything with one command**

```bash
pnpm dev
```

This will:
- Start PostgreSQL via Docker Compose
- Generate Prisma client
- Run database migrations
- Start the dev server with hot reload

**Other dev commands:**

```bash
pnpm dev:docker   # Start only Docker services
pnpm dev:stop     # Stop app and Docker services
pnpm dev:clean    # Stop everything and remove volumes (reset DB)
pnpm dev:kill     # Kill any process on the app port
```

Optional: Start pgAdmin for database management:

```bash
docker compose --profile tools up -d
# Access at http://localhost:5050
```

**Production:**

```bash
pnpm build
pnpm start:prod
```

The service will be available at http://localhost:4001

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/auth/register` | Register new user |
| POST | `/v1/auth/login` | Login with email/password |
| POST | `/v1/auth/refresh` | Refresh access token |
| POST | `/v1/auth/logout` | Revoke refresh token |
| GET | `/v1/auth/me` | Get current user profile |

### Well-Known

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/.well-known/jwks.json` | Get public keys (JWKS) |
| GET | `/.well-known/openid-configuration` | OpenID Connect discovery |

### Internal (Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/internal/keys/rotate` | Rotate signing keys |

Requires `x-service-token` header matching `INTERNAL_SERVICE_TOKEN` env var.

## API Documentation

Swagger UI available at: http://localhost:4001/api/docs

## Token Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Token Flow                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Login/Register                                               │
│     └── Returns: accessToken (JWT) + refreshToken (opaque)       │
│                                                                  │
│  2. API Requests                                                 │
│     └── Authorization: Bearer <accessToken>                      │
│                                                                  │
│  3. Token Refresh (when access token expires)                    │
│     └── POST /v1/auth/refresh with refreshToken                  │
│     └── Returns: NEW accessToken + NEW refreshToken (rotated)    │
│     └── Old refreshToken is invalidated (one-time use)           │
│                                                                  │
│  4. Logout                                                       │
│     └── POST /v1/auth/logout with refreshToken                   │
│     └── Revokes the refresh token                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## JWT Verification (for other services)

Services can verify JWTs using the JWKS endpoint:

```typescript
import * as jose from 'jose';

const JWKS = jose.createRemoteJWKSet(
  new URL('http://auth-service:4001/.well-known/jwks.json')
);

async function verifyToken(token: string) {
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: 'http://auth-service:4001',
    audience: 'auth-service-api',
  });
  return payload;
}
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4001` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_ISSUER` | JWT issuer claim | - |
| `JWT_AUDIENCE` | JWT audience claim | - |
| `ACCESS_TOKEN_TTL_SECONDS` | Access token lifetime | `900` (15 min) |
| `REFRESH_TOKEN_TTL_SECONDS` | Refresh token lifetime | `2592000` (30 days) |
| `AUTH_KEY_ENCRYPTION_SECRET` | Key for encrypting private keys in DB | - |
| `INTERNAL_SERVICE_TOKEN` | Token for internal endpoints | - |
| `KEY_ROTATION_ENABLED` | Enable scheduled key rotation | `false` |
| `KEY_ROTATION_INTERVAL_HOURS` | Hours between rotations | `720` (30 days) |
| `RATE_LIMIT_AUTH_MAX` | Max requests per window | `10` |
| `RATE_LIMIT_AUTH_WINDOW_MS` | Rate limit window | `60000` (1 min) |
| `LOG_LEVEL` | Logging level | `info` |

## Testing

```bash
# Unit tests
pnpm test

# E2E tests (requires running database)
pnpm test:e2e

# Coverage
pnpm test:cov
```

## Key Rotation

Keys can be rotated manually via the internal endpoint:

```bash
curl -X POST http://localhost:4001/internal/keys/rotate \
  -H "x-service-token: your-internal-service-token"
```

Or enable automatic rotation with:

```bash
KEY_ROTATION_ENABLED=true
KEY_ROTATION_INTERVAL_HOURS=720
```

Old keys remain in JWKS until tokens signed with them expire.

## Security Features

- **Password Hashing**: Argon2id with secure parameters
- **No Email Enumeration**: Generic "invalid credentials" error
- **Refresh Token Rotation**: One-time use with token family revocation
- **Key Encryption**: Private keys encrypted at rest in database
- **Rate Limiting**: Protects auth endpoints from brute force
- **Helmet**: Security headers
- **Input Validation**: Strict DTO validation with whitelist
- **Correlation IDs**: Request tracing across services
- **Sensitive Data Redaction**: Passwords and tokens excluded from logs

## Project Structure

```
src/
├── auth/           # Authentication controller & service
├── common/         # Shared guards, filters, middleware, decorators
├── config/         # Environment validation
├── keys/           # Key management, JWKS, rotation
├── prisma/         # Database connection
├── tokens/         # Access & refresh token services
├── users/          # User repository & service
├── well-known/     # JWKS & OpenID config endpoints
├── app.module.ts   # Root module
└── main.ts         # Application bootstrap
```

## Commits & Releases

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and [Semantic Release](https://semantic-release.gitbook.io/) for automated versioning.

### Commit Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | Minor (0.x.0) |
| `fix` | Bug fix | Patch (0.0.x) |
| `perf` | Performance improvement | Patch |
| `refactor` | Code refactoring | Patch |
| `docs` | Documentation | None |
| `style` | Code style (formatting) | None |
| `test` | Adding/updating tests | None |
| `build` | Build system changes | None |
| `ci` | CI/CD changes | None |
| `chore` | Maintenance tasks | None |

Breaking changes: Add `BREAKING CHANGE:` in the footer or `!` after the type (e.g., `feat!:`) for a major version bump.

### Making Commits

```bash
# Interactive commit helper
pnpm commit

# Or manually follow the format
git commit -m "feat(auth): add password reset flow"
git commit -m "fix(tokens): handle expired refresh token edge case"
```

### Releasing

Releases happen automatically when commits are pushed to `main`/`master`:

1. Commits are analyzed to determine version bump
2. CHANGELOG.md is updated
3. Version in package.json is bumped
4. Git tag is created
5. GitHub release is published

To preview what would be released:

```bash
pnpm release:dry
```

## License

MIT
