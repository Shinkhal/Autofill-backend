import type { ResumeData } from '../schemas/profile.js';
import { updateSchema } from '../schemas/profile.js';
import type { z } from 'zod';

// Flatten only validated data so partial updates preserve other profile fields.
export function buildProfileUpdate(input: z.infer<typeof updateSchema>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  function walk(value: unknown, path: string): void {
    if (value === undefined) return;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) walk(child, path ? path + '.' + key : key);
    } else {
      result[path] = value;
    }
  }
  walk(input, '');
  return result;
}

export function resumeUpdate(data: ResumeData): Record<string, unknown> {
  const { fullName, name, email: _email, technicalSkills, softSkills, tools, languages,
    education, workExperience, jobPreferences, ...profile } = data;
  return buildProfileUpdate({
    name: (fullName || name)?.trim() || undefined,
    profile: {
      ...profile,
      skills: { technicalSkills, softSkills, tools, languages },
      education: education?.map(({ graduationYear, ...entry }) => ({ ...entry, endDate: entry.endDate || graduationYear })),
      experience: workExperience?.map(({ achievements: _achievements, ...entry }) => entry)
    },
    jobPreferences
  });
}
