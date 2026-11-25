import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';

const claims = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });

export function signToken(user: { id: string; email: string; name: string; image?: string }): string {
  return jwt.sign(user, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
}

export function verifyToken(token: string): string {
  return claims.parse(jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })).id;
}
