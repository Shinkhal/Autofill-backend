import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.0-flash'),
  SERVER_URL: z.string().url(),
  CLIENT_URL: z.string().url(),
  RAPIDAPI_KEY: z.string().optional(),
  JOOBLE_API_KEY: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0)
});

const result = schema.safeParse(process.env);
if (!result.success) {
  throw new Error('Invalid environment configuration: ' + result.error.issues.map(issue => issue.path.join('.')).join(', '));
}
export const env = result.data;
