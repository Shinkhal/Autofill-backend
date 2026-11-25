import { z } from 'zod';

const field = z.object({
  id: z.string().min(1).max(200),
  label: z.string().max(300).optional(),
  name: z.string().max(200).optional(),
  autocomplete: z.string().max(100).optional(),
  type: z.enum(['text', 'email', 'tel', 'url', 'textarea', 'number', 'date', 'select', 'radio', 'checkbox', 'hidden', 'password', 'file', 'other']).default('text'),
  options: z.array(z.object({ label: z.string().max(200), value: z.string().max(200) }).strict()).max(200).optional(),
  itemIndex: z.number().int().min(0).max(99).optional()
}).strict();
export const autofillSchema = z.object({ fields: z.array(field).min(1).max(100) }).strict()
  .refine(input => new Set(input.fields.map(field => field.id)).size === input.fields.length, { message: 'Duplicate field IDs' });
export type AutofillField = z.infer<typeof field>;

export const answerSuggestionSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  jobContext: z.string().trim().max(5000).optional(),
  factSources: z.array(z.enum(['summary', 'skills', 'education', 'experience', 'projects'])).min(1).max(5)
}).strict();
export type AnswerSuggestionInput = z.infer<typeof answerSuggestionSchema>;
export const answerSuggestionOutput = z.object({
  answer: z.string().max(2000),
  needsInput: z.boolean()
}).strict();
