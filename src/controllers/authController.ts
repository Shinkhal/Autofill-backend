import type { RequestHandler, Request, Response, CookieOptions } from 'express';
import { z } from 'zod';
import User from '../models/User.js';
import { AuthSession } from '../models/AuthSession.js';
import { getEnv } from '../config/env.config.js';
import { exchangeAuthCode, issueAuthCode, rotateRefreshToken, revokeSession, revokeAllSessions } from '../services/authService.js';
import { exchangeSchema, refreshSchema } from '../schemas/auth.js';
import { HttpError } from '../utils/http-error.js';
import { objectId } from '../schemas/job.js';

const googleProfile = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  emails: z.array(z.object({ value: z.string().email() })).min(1),
  photos: z.array(z.object({ value: z.string() })).optional()
});
const REFRESH_COOKIE = 'autofill.refresh';
const cookieOptions = (): CookieOptions => ({
  httpOnly: true, secure: getEnv.app.isProd(), sameSite: getEnv.app.isProd() ? 'none' : 'lax', path: '/auth'
});

function requireClientOrigin(req: Request): void {
  if (req.get('origin') !== new URL(getEnv.client.url()).origin) throw new HttpError(403, 'Invalid client origin');
}
function requireExtensionOrigin(req: Request): void {
  const origin = req.get('origin');
  if (origin && !getEnv.client.extensionOrigins().includes(origin)) throw new HttpError(403, 'Invalid extension origin');
}
function readCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const pair = header.split(';').map(part => part.trim()).find(part => part.startsWith(REFRESH_COOKIE + '='));
  if (!pair) return undefined;
  try { return decodeURIComponent(pair.slice(REFRESH_COOKIE.length + 1)); } catch { return undefined; }
}
function sendTokens(res: Response, tokens: Awaited<ReturnType<typeof exchangeAuthCode>>): void {
  const { refreshToken, client, ...response } = tokens;
  if (client === 'web') {
    res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(), expires: tokens.refreshExpiresAt });
    res.json(response);
  } else {
    res.json({ ...response, refreshToken });
  }
}

export const googleCallback: RequestHandler = async (req, res) => {
  const result = googleProfile.safeParse(req.user);
  if (!result.success) throw new HttpError(401, 'Google account profile unavailable');
  const profile = result.data;
  const email = profile.emails[0]!.value;
  const user = await User.findOneAndUpdate({ googleId: profile.id }, {
    $setOnInsert: { googleId: profile.id, name: profile.displayName, email, image: profile.photos?.[0]?.value }
  }, { upsert: true, new: true, runValidators: true });
  const code = await issueAuthCode(user._id);
  const redirect = new URL('/auth-success', getEnv.client.url());
  redirect.hash = new URLSearchParams({ code }).toString();
  res.set('Cache-Control', 'no-store').redirect(redirect.href);
};

export const exchange: RequestHandler = async (req, res) => {
  const input = exchangeSchema.parse(req.body);
  if (input.client === 'web') requireClientOrigin(req);
  else requireExtensionOrigin(req);
  sendTokens(res, await exchangeAuthCode(input.code, input.client, input.deviceName));
};

export const refresh: RequestHandler = async (req, res) => {
  const input = refreshSchema.parse(req.body ?? {});
  if (input.refreshToken) {
    requireExtensionOrigin(req);
    sendTokens(res, await rotateRefreshToken(input.refreshToken, 'extension'));
    return;
  }
  requireClientOrigin(req);
  const token = readCookie(req);
  if (!token) throw new HttpError(401, 'Missing refresh token');
  sendTokens(res, await rotateRefreshToken(token, 'web'));
};

export const me: RequestHandler = (req, res) => { res.json(req.authenticatedUser); };
export const logout: RequestHandler = async (req, res) => {
  await revokeSession(req.authenticatedUser!._id.toString(), req.authSessionId!);
  res.clearCookie(REFRESH_COOKIE, cookieOptions()).status(204).end();
};
export const logoutAll: RequestHandler = async (req, res) => {
  await revokeAllSessions(req.authenticatedUser!._id.toString());
  res.clearCookie(REFRESH_COOKIE, cookieOptions()).status(204).end();
};
export const listSessions: RequestHandler = async (req, res) => {
  const sessions = await AuthSession.find({ userId: req.authenticatedUser!._id, revokedAt: null, expiresAt: { $gt: new Date() } })
    .select('deviceName client createdAt lastUsedAt expiresAt').sort({ lastUsedAt: -1 }).limit(100);
  res.json({ sessions, currentSessionId: req.authSessionId });
};
export const deleteSession: RequestHandler = async (req, res) => {
  const id = objectId.parse(req.params.id);
  await revokeSession(req.authenticatedUser!._id.toString(), id);
  if (id === req.authSessionId) res.clearCookie(REFRESH_COOKIE, cookieOptions());
  res.status(204).end();
};
