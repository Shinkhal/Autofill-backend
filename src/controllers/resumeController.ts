import type { RequestHandler } from 'express';
import { extractTextFromPDF } from '../services/pdfParser.js';
import { parseResumeWithAI } from '../services/aiService.js';
import { applyParsedResume, storeResume, parseStoredResume } from '../services/resumeService.js';
import { HttpError } from '../utils/http-error.js';
import { Resume } from '../models/Resume.js';
import { objectId } from '../schemas/job.js';
import { resumeLabelSchema, resumeUploadSchema } from '../schemas/resume.js';

export const handleResumeUpload: RequestHandler = async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No resume file uploaded');
  const userId = req.authenticatedUser!._id.toString();
  const parsed = await parseResumeWithAI(await extractTextFromPDF(req.file.buffer));
  const saved = await storeResume(userId, req.file, undefined, parsed);
  await applyParsedResume(userId, parsed);
  res.json({ message: 'Profile updated successfully from resume', resumeId: saved.id });
};

export const createResume: RequestHandler = async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No resume file uploaded');
  const { label } = resumeUploadSchema.parse(req.body ?? {});
  res.status(201).json(await storeResume(req.authenticatedUser!._id.toString(), req.file, label));
};

export const listResumes: RequestHandler = async (req, res) => {
  const resumes = await Resume.find({ userId: req.authenticatedUser!._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ resumes });
};

export const getResume: RequestHandler = async (req, res) => {
  const resume = await Resume.findOne({ _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id }).select('+parsedProfile');
  if (!resume) throw new HttpError(404, 'Resume not found');
  res.json(resume);
};

export const renameResume: RequestHandler = async (req, res) => {
  const { label } = resumeLabelSchema.parse(req.body);
  const resume = await Resume.findOneAndUpdate({ _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id }, { $set: { label } }, { new: true, runValidators: true });
  if (!resume) throw new HttpError(404, 'Resume not found');
  res.json(resume);
};

export const deleteResume: RequestHandler = async (req, res) => {
  const deleted = await Resume.deleteOne({ _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id });
  if (!deleted.deletedCount) throw new HttpError(404, 'Resume not found');
  res.status(204).end();
};

export const downloadResume: RequestHandler = async (req, res) => {
  const resume = await Resume.findOne({ _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id }).select('+content');
  if (!resume) throw new HttpError(404, 'Resume not found');
  res.attachment(resume.originalName).type('application/pdf').send(resume.content);
};

export const parseResume: RequestHandler = async (req, res) => {
  const parsedProfile = await parseStoredResume(req.authenticatedUser!._id.toString(), objectId.parse(req.params.id));
  res.json({ parsedProfile });
};

export const applyResume: RequestHandler = async (req, res) => {
  const resume = await Resume.findOne({ _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id }).select('+parsedProfile');
  if (!resume) throw new HttpError(404, 'Resume not found');
  if (!resume.parsedProfile) throw new HttpError(409, 'Parse resume before applying it');
  const user = await applyParsedResume(req.authenticatedUser!._id.toString(), resume.parsedProfile);
  res.json({ message: 'Profile updated successfully from resume', user });
};
