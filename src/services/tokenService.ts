import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getEnv } from '../config/env.config.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const claims = z.object({ id: objectId, sid: objectId, type: z.literal('access') });
export const ACCESS_TTL_SECONDS = 15 * 60;
export const TOKEN_ISSUER = 'jobautofill';
export const TOKEN_AUDIENCE = 'jobautofill-api';

export function signToken(user: { id: string; email: string; name: string; image?: string }, sessionId: string): string {
  return jwt.sign({ ...user, sid: sessionId, type: 'access' }, getEnv.jwt.accessSecret(), {
    algorithm: 'HS256', expiresIn: ACCESS_TTL_SECONDS, issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE
  });
}

export function verifyToken(token: string): z.infer<typeof claims> {
  return claims.parse(jwt.verify(token, getEnv.jwt.accessSecret(), {
    algorithms: ['HS256'], issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE
  }));
}
