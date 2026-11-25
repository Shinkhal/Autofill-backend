import type { RequestHandler } from 'express';
import { z } from 'zod';
import { listingQuery, salaryQuery, providerSource } from '../schemas/listing.js';
import { listJobs, getListing, getSalaries } from '../services/listjobs.js';
import { HttpError } from '../utils/http-error.js';

function respondError(res: Parameters<RequestHandler>[1], error: unknown): void {
  const status = error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 502;
  res.status(status).json({ success: false, message: error instanceof HttpError ? error.message : status === 400 ? 'Invalid request data' : 'Job provider unavailable' });
}

export const getAllJobListings: RequestHandler = async (req, res) => {
  try { res.json(await listJobs(listingQuery.parse(req.query))); }
  catch (error) { respondError(res, error); }
};

export const getJobById: RequestHandler = async (req, res) => {
  try {
    const source = providerSource.parse(typeof req.params.source === 'string' ? req.params.source.toLowerCase() : undefined);
    const id = z.string().min(1).max(250).parse(req.params.id);
    res.json({ success: true, job: await getListing(source, id) });
  } catch (error) { respondError(res, error); }
};

export const getJobSalaries: RequestHandler = async (req, res) => {
  try { res.json({ success: true, salaryData: await getSalaries(salaryQuery.parse(req.query)) }); }
  catch (error) { respondError(res, error); }
};
