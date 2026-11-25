import type { RequestHandler } from 'express';
import { extractTextFromPDF } from '../services/pdfParser.js';
import { getATSFeedback, isLikelyResume } from '../services/atsService.js';
import { atsInputSchema } from '../schemas/ats.js';
import User from '../models/User.js';
import { HttpError } from '../utils/http-error.js';

export const analyzeResume: RequestHandler = async (req, res) => {
  const input = atsInputSchema.safeParse(req.body);
  if (!req.file || !input.success) {
    res.status(400).json({ success: false, error: 'Resume file and job description of 50–30000 characters are required.' });
    return;
  }
  const userId = req.authenticatedUser!._id;
  const month = new Date().toISOString().slice(0, 7);
  // Atomic monthly quota reservation; legacy counts are retained for the first current month.
  await User.updateOne({ _id: userId, resumeChecksMonth: { $exists: false } }, { $set: { resumeChecksMonth: month } });
  await User.updateOne({ _id: userId, resumeChecksMonth: { $lt: month } }, { $set: { resumeChecksMonth: month, resumeChecks: 0 } });
  const reservation = await User.findOneAndUpdate({ _id: userId, resumeChecksMonth: month,
    $or: [{ resumeChecks: { $lt: 5 } }, { resumeChecks: { $exists: false } }] }, { $inc: { resumeChecks: 1 } });
  if (!reservation) {
    res.status(400).json({ success: false, error: 'You have reached the maximum number of resume checks for this month.', code: 'FREE_LIMIT_REACHED' });
    return;
  }
  try {
    const resume = await extractTextFromPDF(req.file.buffer);
    if (!isLikelyResume(resume)) {
      await User.updateOne({ _id: userId, resumeChecksMonth: month, resumeChecks: { $gt: 0 } }, { $inc: { resumeChecks: -1 } });
      res.status(400).json({ success: false, error: 'The uploaded document does not appear to be a resume.', code: 'INVALID_RESUME_FORMAT' });
      return;
    }
    const feedback = await getATSFeedback(resume, input.data.jd);
    res.json({ success: true, ...feedback });
  } catch (error) {
    await User.updateOne({ _id: userId, resumeChecksMonth: month, resumeChecks: { $gt: 0 } }, { $inc: { resumeChecks: -1 } });
    const status = error instanceof HttpError ? error.status : 500;
    const code = status === 429 ? 'RATE_LIMIT_ERROR' : status === 400 || status === 422 ? 'PDF_EXTRACTION_ERROR' : 'ATS_ANALYSIS_ERROR';
    res.status(status === 422 ? 400 : status).json({ success: false, error: error instanceof HttpError ? error.message : 'Failed to analyze resume', code });
  }
};
