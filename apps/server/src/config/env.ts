import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  // Auth
  // JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // JWT_EXPIRES_IN: z.string().default('7d'),

  // Mailer
  // GMAIL_USER: z.string().email('GMAIL_USER must be a valid email'),
  // GMAIL_APP_PASSWORD: z.string().min(1, 'GMAIL_APP_PASSWORD is required'),

  // Encryption
  // ENCRYPTION_KEY: z
  //   .string()
  //   .length(64, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
