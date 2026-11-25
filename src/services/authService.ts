import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { AuthCode } from '../models/AuthCode.js';
import { AuthSession } from '../models/AuthSession.js';
import User, { type UserDocument } from '../models/User.js';
import { signToken, ACCESS_TTL_SECONDS } from './tokenService.js';
import { HttpError } from '../utils/http-error.js';

const CODE_TTL_MS = 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ROTATIONS = 4096;
export type AuthClient = 'web' | 'extension';

export function hashCredential(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function secret(): string { return randomBytes(32).toString('base64url'); }

export function decodeRefreshToken(token: string) {
  const match = /^([a-f\d]{24})\.([A-Za-z0-9_-]{43})$/i.exec(token);
  if (!match) throw new HttpError(401, 'Invalid refresh token');
  return { id: match[1]!, hash: hashCredential(token) };
}

function createRefreshToken(id: string): string { return id + '.' + secret(); }
function tokenResponse(user: UserDocument, sessionId: string, refreshToken: string, expiresAt: Date, client: AuthClient) {
  return {
    accessToken: signToken({ id: user._id.toString(), email: user.email, name: user.name, image: user.image ?? undefined }, sessionId),
    refreshToken, expiresIn: ACCESS_TTL_SECONDS, refreshExpiresAt: expiresAt, sessionId, client
  };
}

export async function issueAuthCode(userId: mongoose.Types.ObjectId): Promise<string> {
  const code = secret();
  await AuthCode.create({ hash: hashCredential(code), userId, expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  return code;
}

export async function exchangeAuthCode(code: string, client: AuthClient, deviceName?: string) {
  // Atomic consumption prevents parallel exchanges of the same code.
  const grant = await AuthCode.findOneAndDelete({ hash: hashCredential(code), expiresAt: { $gt: new Date() } });
  if (!grant) throw new HttpError(401, 'Invalid or expired authorization code');
  const user = await User.findById(grant.userId);
  if (!user) throw new HttpError(401, 'Invalid authorization code');
  const id = new mongoose.Types.ObjectId();
  const refreshToken = createRefreshToken(id.toString());
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await AuthSession.create({ _id: id, userId: user._id, refreshHash: hashCredential(refreshToken), expiresAt, client,
    deviceName, lastUsedAt: new Date() });
  return tokenResponse(user, id.toString(), refreshToken, expiresAt, client);
}

export async function rotateRefreshToken(token: string, client: AuthClient) {
  const { id, hash } = decodeRefreshToken(token);
  const next = createRefreshToken(id);
  const now = new Date();
  const updated = await AuthSession.findOneAndUpdate({
    _id: id, client, refreshHash: hash, revokedAt: null, expiresAt: { $gt: now },
    ['usedHashes.' + (MAX_ROTATIONS - 1)]: { $exists: false }
  }, {
    $set: { refreshHash: hashCredential(next), lastUsedAt: now },
    $push: { usedHashes: hash }
  }, { new: true });
  if (!updated) {
    // Reuse of a known spent token revokes its session; a random invalid token does not.
    await AuthSession.updateOne({ _id: id, client, revokedAt: null, usedHashes: hash }, { $set: { revokedAt: now } });
    throw new HttpError(401, 'Invalid, expired or already used refresh token');
  }
  const user = await User.findById(updated.userId);
  if (!user) {
    await AuthSession.updateOne({ _id: id }, { $set: { revokedAt: now } });
    throw new HttpError(401, 'Invalid session');
  }
  return tokenResponse(user, id, next, updated.expiresAt, client);
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  await AuthSession.updateOne({ _id: sessionId, userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await AuthSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
