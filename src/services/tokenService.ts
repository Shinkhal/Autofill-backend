import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getEnv } from '../config/env.config.js';

const claims = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });

export function signToken(user: { id: string; email: string; name: string; image?: string }): string {
  return jwt.sign(user, getEnv.jwt.accessSecret(), { algorithm: 'HS256', expiresIn: '7d' });
}

export function verifyToken(token: string): string {
  return claims.parse(jwt.verify(token, getEnv.jwt.accessSecret(), { algorithms: ['HS256'] })).id;
}
