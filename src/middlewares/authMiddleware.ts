import type { RequestHandler } from 'express';
import { AuthSession } from '../models/AuthSession.js';
import User from '../models/User.js';
import { verifyToken } from '../services/tokenService.js';
import { HttpError } from '../utils/http-error.js';

export const protect: RequestHandler = async (req, _res, next) => {
  const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new HttpError(401, 'Unauthorized: No token provided');
  let claims: ReturnType<typeof verifyToken>;
  try {
    claims = verifyToken(token);
  } catch {
    throw new HttpError(401, 'Unauthorized: Invalid or expired token');
  }
  const active = await AuthSession.exists({ _id: claims.sid, userId: claims.id, revokedAt: null, expiresAt: { $gt: new Date() } });
  if (!active) throw new HttpError(401, 'Session expired or revoked');
  const user = await User.findById(claims.id);
  if (!user) throw new HttpError(404, 'User not found in database');
  req.authenticatedUser = user;
  req.authSessionId = claims.sid;
  next();
};

export const requireOwner: RequestHandler = (req, _res, next) => {
  if (req.authenticatedUser?._id.toString() !== req.params.id) {
    throw new HttpError(403, 'Forbidden');
  }
  next();
};
