import { z } from 'zod';

export const atsInputSchema = z.object({ jd: z.string().trim().min(50).max(30000) });
export const atsFeedbackSchema = z.object({
  score: z.number().min(0).max(100),
  suggestions: z.array(z.string().min(20).max(2000)).min(3).max(5),
  scoring_breakdown: z.object({
    keyword_alignment: z.number().min(0).max(30),
    experience_match: z.number().min(0).max(25),
    skill_coverage: z.number().min(0).max(20),
    achievement_quantification: z.number().min(0).max(15),
    format_compliance: z.number().min(0).max(10)
  })
});
export type ATSFeedback = z.infer<typeof atsFeedbackSchema>;
export function normalizeATSFeedback(input: unknown): ATSFeedback {
  const data = atsFeedbackSchema.parse(input);
  data.score = Math.round(Object.values(data.scoring_breakdown).reduce((a, b) => a + b, 0) * 10) / 10;
  return data;
}
