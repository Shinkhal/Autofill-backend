import type { Express } from 'express';
import { Resume } from '../models/Resume.js';
import User from '../models/User.js';
import { extractTextFromPDF } from './pdfParser.js';
import { parseResumeWithAI } from './aiService.js';
import { resumeSchema, type ResumeData } from '../schemas/profile.js';
import { resumeUpdate } from '../utils/profile-update.js';
import { HttpError } from '../utils/http-error.js';

export function safeFileName(value: string): string {
  return value.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 200) || 'resume.pdf';
}

export async function storeResume(userId: string, file: Express.Multer.File, label?: string, parsed?: ResumeData) {
  if (file.buffer.length === 0 || file.buffer.length > 5 * 1024 * 1024 || !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new HttpError(400, 'Invalid PDF file');
  }
  const originalName = safeFileName(file.originalname);
  const occupied = await Resume.find({ userId }).select('+slot').select('slot').lean();
  const slots = new Set(occupied.map(row => row.slot));
  for (let slot = 0; slot < 20; slot++) {
    if (slots.has(slot)) continue;
    try {
      const doc = await Resume.create({ userId, slot, label: label ?? originalName.slice(0, 150), originalName,
        mimeType: 'application/pdf', size: file.buffer.length, content: file.buffer,
        ...(parsed ? { parsedProfile: parsed, parsedAt: new Date() } : {}) });
      return { id: doc._id, label: doc.label, originalName: doc.originalName, size: doc.size, parsedAt: doc.parsedAt };
    } catch (error) {
      // A concurrent upload may reserve this slot; the unique index enforces the limit.
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
    }
  }
  throw new HttpError(409, 'Resume storage limit reached (20 files)');
}

export async function parseStoredResume(userId: string, resumeId: string): Promise<ResumeData> {
  const resume = await Resume.findOne({ _id: resumeId, userId }).select('+content');
  if (!resume) throw new HttpError(404, 'Resume not found');
  const parsed = await parseResumeWithAI(await extractTextFromPDF(resume.content));
  const updated = await Resume.updateOne({ _id: resumeId, userId }, { $set: { parsedProfile: parsed, parsedAt: new Date() } });
  if (!updated.matchedCount) throw new HttpError(404, 'Resume not found');
  return parsed;
}

export async function applyParsedResume(userId: string, data: unknown) {
  const parsed = resumeSchema.parse(data);
  const updates = resumeUpdate(parsed);
  if (!Object.keys(updates).length) throw new HttpError(422, 'No usable profile information found');
  const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true, runValidators: true });
  if (!user) throw new HttpError(404, 'User not found');
  return user;
}
