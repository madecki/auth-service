// Test setup file
// This runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_ISSUER = 'http://localhost:4000';
process.env.JWT_AUDIENCE = 'auth-service-api';
process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
process.env.REFRESH_TOKEN_TTL_SECONDS = '2592000';
process.env.AUTH_KEY_ENCRYPTION_SECRET = 'test-encryption-secret-32-chars-min';
process.env.INTERNAL_SERVICE_TOKEN = 'test-internal-service-token-32-chars-minimum';
process.env.RATE_LIMIT_AUTH_MAX = '100';
process.env.RATE_LIMIT_AUTH_WINDOW_MS = '60000';
process.env.LOG_LEVEL = 'error';
