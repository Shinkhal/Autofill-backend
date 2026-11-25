import type { RequestHandler } from 'express';
import User from '../models/User.js';
import { updateSchema } from '../schemas/profile.js';
import { buildProfileUpdate } from '../utils/profile-update.js';
import { HttpError } from '../utils/http-error.js';

export const getProfile: RequestHandler = async (req, res) => {
  const user = await User.findById(req.authenticatedUser?._id).select('-__v');
  if (!user) throw new HttpError(404, 'User not found');
  res.json(user);
};

export const updateProfile: RequestHandler = async (req, res) => {
  const updates = buildProfileUpdate(updateSchema.parse(req.body));
  if (!Object.keys(updates).length) throw new HttpError(400, 'No profile changes provided');
  const user = await User.findByIdAndUpdate(req.authenticatedUser?._id, { $set: updates }, { new: true, runValidators: true });
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ message: 'Profile updated successfully', user });
};
