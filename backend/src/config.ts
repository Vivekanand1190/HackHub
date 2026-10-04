import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * Resolve the JWT signing secret.
 *
 * - If JWT_SECRET is set, use it.
 * - In production, refuse to start without one (a predictable default would let
 *   anyone forge tokens).
 * - In development, fall back to a STABLE placeholder so tokens stay valid
 *   across the frequent restarts of the dev server (ts-node-dev respawns on
 *   every file change). A per-process random secret here silently invalidates
 *   every token on each restart — which shows up as "Token is invalid or
 *   expired" on the very next request.
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length > 0) return secret;

  if (nodeEnv === 'production') {
    throw new Error(
      'JWT_SECRET must be set in production. Refusing to start with an insecure default.'
    );
  }

  console.warn(
    '⚠️  JWT_SECRET is not set — using a stable development-only secret. ' +
      'Set JWT_SECRET in backend/.env to silence this warning.\n' +
      '   Note: every backend that issues or verifies tokens must share the ' +
      'same JWT_SECRET. If two instances disagree, tokens minted by one are ' +
      'rejected by the other as "Token is invalid or expired".'
  );
  return 'hackhub-development-only-jwt-secret';
}

/**
 * Allowed browser origins for CORS. Prefer an explicit CORS_ORIGINS list;
 * otherwise fall back to the single FRONTEND_URL.
 */
const corsOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  nodeEnv,
  port: process.env.PORT || '8888',
  jwtSecret: resolveJwtSecret(),
  databaseUrl: process.env.DATABASE_URL || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigins,
};


