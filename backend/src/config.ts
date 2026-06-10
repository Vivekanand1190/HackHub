import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

export const config = {
  port: process.env.PORT || '8888',
  jwtSecret: process.env.JWT_SECRET || 'supersecret-hackhub-jwt-token-key-2026',
  sessionSecret: process.env.SESSION_SECRET || 'hackhub-session-secret-2026',
  databaseUrl: process.env.DATABASE_URL || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8888/api/auth/google/callback',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '',
};
