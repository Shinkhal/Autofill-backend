import { pageQuery } from '../schemas/answer.js';
import type { RequestHandler } from 'express';
import { JobApplication } from '../models/JobApplication.js';
import { jobSchema, jobUpdateSchema, objectId, jobStatus } from '../schemas/job.js';
import { HttpError } from '../utils/http-error.js';

export const getAllJobs: RequestHandler = async (req, res) => {
  const {status, page, limit} = pageQuery.extend({status:jobStatus.optional()}).parse(req.query);
  const filter = {userId:req.authenticatedUser!._id,...(status ? {status} : {})};
  if (req.query.page === undefined && req.query.limit === undefined) {
    res.json(await JobApplication.find(filter).sort({createdAt:-1})); return;
  }
  const [jobs,total] = await Promise.all([JobApplication.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit),JobApplication.countDocuments(filter)]);
  res.json({jobs,total,page,limit});
};

export const createJob: RequestHandler = async (req, res) => {
  const input = jobSchema.parse(req.body);
  const job = await JobApplication.create({ ...input, userId: req.authenticatedUser!._id, statusHistory: [{status:input.status ?? "Applied",changedAt:new Date()}] });
  res.status(201).json(job);
};

export const getJobById: RequestHandler = async (req, res) => {
  const job = await JobApplication.findOne({ _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id });
  if (!job) throw new HttpError(404, 'Job not found');
  res.json(job);
};

export const updateJob: RequestHandler = async (req, res) => {
  const input = jobUpdateSchema.parse(req.body);
  const job = await JobApplication.findOneAndUpdate(
    { _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id },
    { $set: input, ...(input.status ? {$push:{statusHistory:{status:input.status,changedAt:new Date()}}} : {}) }, { new: true, runValidators: true }
  );
  if (!job) throw new HttpError(404, 'Job not found');
  res.json(job);
};

export const deleteJob: RequestHandler = async (req, res) => {
  const job = await JobApplication.findOneAndDelete({ _id: objectId.parse(req.params.id), userId: req.authenticatedUser!._id });
  if (!job) throw new HttpError(404, 'Job not found');
  res.json({ message: 'Job deleted' });
};

export const jobStats: RequestHandler = async (req,res) => {
  const userId = req.authenticatedUser!._id;
  const rows = await JobApplication.aggregate([{$match:{userId}},{$group:{_id:'$status',count:{$sum:1}}}]);
  const byStatus = Object.fromEntries(jobStatus.options.map(status=>[status,0]));
  for (const row of rows) if (Object.hasOwn(byStatus,row._id)) byStatus[row._id]=row.count;
  res.json({byStatus,total:Object.values(byStatus).reduce((a,b)=>a+b,0)});
};
