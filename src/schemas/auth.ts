import { z } from 'zod';
export const exchangeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  client: z.enum(['web', 'extension']).default('web'),
  deviceName: z.string().trim().min(1).max(150).optional()
}).strict();
export const refreshSchema = z.object({ refreshToken: z.string().max(100).optional() }).strict();
