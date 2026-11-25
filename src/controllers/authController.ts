import type { RequestHandler } from 'express';
import { z } from 'zod';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { signToken } from '../services/tokenService.js';
import { HttpError } from '../utils/http-error.js';

const googleProfile = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  emails: z.array(z.object({ value: z.string().email() })).min(1),
  photos: z.array(z.object({ value: z.string() })).optional()
});

export const googleCallback: RequestHandler = async (req, res) => {
  const result = googleProfile.safeParse(req.user);
  if (!result.success) throw new HttpError(401, 'Google account profile unavailable');
  const profile = result.data;
  const email = profile.emails[0]!.value;
  const user = await User.findOneAndUpdate({ googleId: profile.id }, {
    $setOnInsert: { googleId: profile.id, name: profile.displayName, email, image: profile.photos?.[0]?.value }
  }, { upsert: true, new: true, runValidators: true });
  const token = signToken({ id: user._id.toString(), email: user.email, name: user.name, image: user.image ?? undefined });
  const redirect = new URL('/auth-success', env.CLIENT_URL);
  redirect.searchParams.set('token', token);
  res.set('Cache-Control', 'no-store').redirect(redirect.href);
};
