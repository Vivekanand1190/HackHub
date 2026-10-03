import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config({ path: path.join(__dirname, '../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * Resolve the JWT signing secret.
 *
 * A predictable, hardcoded secret lets anyone forge valid tokens, so:
 *  - in production we refuse to start without an explicit JWT_SECRET;
 *  - in development we fall back to a random per-process secret (tokens are
 *    simply invalidated on restart) rather than a value that ships in git.
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
    '⚠️  JWT_SECRET is not set — using a random per-process secret. ' +
      'Tokens will be invalidated on restart. Set JWT_SECRET in backend/.env for a stable dev session.'
  );
  return crypto.randomBytes(32).toString('hex');
}

function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.trim().length > 0) return secret;
  return crypto.randomBytes(32).toString('hex');
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
  sessionSecret: resolveSessionSecret(),
  databaseUrl: process.env.DATABASE_URL || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigins,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8888/api/auth/google/callback',
  },
  huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '',
};
