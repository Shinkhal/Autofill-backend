import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const jobStatus = z.enum(['Saved', 'Applied', 'Interview', 'Rejected', 'Offer', 'Accepted', 'Withdrawn']);
export const jobSchema = z.object({
  company: z.string().trim().min(1).max(300),
  role: z.string().trim().min(1).max(300),
  status: jobStatus.optional(),
  jobLink: z.string().url().max(2000).refine(value => /^https?:\/\//i.test(value)).or(z.literal('')).optional(),
  location: z.string().trim().max(300).optional(),
  source: z.string().trim().max(100).optional(),
  followUpDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(10000).optional(),
  dateApplied: z.coerce.date().optional()
}).strict();
export const jobUpdateSchema = jobSchema.partial().refine(value => Object.keys(value).length > 0);
