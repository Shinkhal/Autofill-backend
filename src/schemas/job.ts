import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const jobSchema = z.object({
  company: z.string().trim().min(1).max(300),
  role: z.string().trim().min(1).max(300),
  status: z.enum(['Applied', 'Interview', 'Rejected', 'Offer']).optional(),
  jobLink: z.string().url().max(2000).refine(value => /^https?:\/\//i.test(value)).or(z.literal('')).optional(),
  notes: z.string().max(10000).optional(),
  dateApplied: z.coerce.date().optional()
}).strict();
export const jobUpdateSchema = jobSchema.partial().refine(value => Object.keys(value).length > 0);
