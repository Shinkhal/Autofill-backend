import { z } from 'zod';
export const answerSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(10000),
  category: z.string().trim().min(1).max(80).optional()
}).strict();
export const questionKey = (question: string) => question.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?]+$/, '').trim();
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
