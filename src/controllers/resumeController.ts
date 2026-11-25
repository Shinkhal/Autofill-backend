import type { RequestHandler } from 'express';
import { extractTextFromPDF } from '../services/pdfParser.js';
import { parseResumeWithAI } from '../services/aiService.js';
import { resumeUpdate } from '../utils/profile-update.js';
import { HttpError } from '../utils/http-error.js';
import User from '../models/User.js';

export const handleResumeUpload: RequestHandler = async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No resume file uploaded');
  const text = await extractTextFromPDF(req.file.buffer);
  const updates = resumeUpdate(await parseResumeWithAI(text));
  if (!Object.keys(updates).length) throw new HttpError(422, 'No usable profile information found');
  const user = await User.findByIdAndUpdate(req.authenticatedUser?._id, { $set: updates }, { new: true, runValidators: true });
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ message: 'Profile updated successfully from resume' });
};
