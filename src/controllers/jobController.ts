import type { RequestHandler } from 'express';
import { JobApplication } from '../models/JobApplication.js';
import { jobSchema, jobUpdateSchema, objectId } from '../schemas/job.js';
import { HttpError } from '../utils/http-error.js';

export const getAllJobs: RequestHandler = async (req, res) => {
  res.json(await JobApplication.find({ userId: req.authenticatedUser!._id }).sort({ createdAt: -1 }));
};

export const createJob: RequestHandler = async (req, res) => {
  const job = await JobApplication.create({ ...jobSchema.parse(req.body), userId: req.authenticatedUser!._id });
  res.status(201).json(job);
};

export const getJobById: RequestHandler = async (req, res) => {
  const job = await JobApplication.findOne({ _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id });
  if (!job) throw new HttpError(404, 'Job not found');
  res.json(job);
};

export const updateJob: RequestHandler = async (req, res) => {
  const job = await JobApplication.findOneAndUpdate(
    { _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id },
    { $set: jobUpdateSchema.parse(req.body) }, { new: true, runValidators: true }
  );
  if (!job) throw new HttpError(404, 'Job not found');
  res.json(job);
};

export const deleteJob: RequestHandler = async (req, res) => {
  const job = await JobApplication.findOneAndDelete({ _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id });
  if (!job) throw new HttpError(404, 'Job not found');
  res.json({ message: 'Job deleted' });
};
