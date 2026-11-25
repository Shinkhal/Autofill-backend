import { z } from 'zod';
export const resumeLabelSchema = z.object({ label: z.string().trim().min(1).max(150) }).strict();
export const resumeUploadSchema = resumeLabelSchema.partial();
