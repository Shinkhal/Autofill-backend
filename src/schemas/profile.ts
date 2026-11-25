import { z } from 'zod';

const str = z.string().max(10000);
const optional = str.optional();
const strings = z.array(str).max(200);
const address = z.object({
  street: optional, city: optional, state: optional, zipCode: optional, country: optional
}).strict();
const subdocumentId = z.string().regex(/^[a-f\d]{24}$/i).optional();
const education = z.object({
  _id: subdocumentId,
  degree: optional, fieldOfStudy: optional, institution: optional, startDate: optional,
  endDate: optional, gpa: optional
}).strict();
const experience = z.object({
  _id: subdocumentId,
  jobTitle: optional, company: optional, employmentType: optional, startDate: optional,
  endDate: optional, jobDescription: optional, isCurrentJob: z.boolean().optional()
}).strict();
const project = z.object({ _id: subdocumentId, name: optional, description: optional, technologies: strings.optional(), link: optional }).strict();
const certification = z.object({ _id: subdocumentId, name: optional, issuingOrganization: optional, issueDate: optional, url: optional }).strict();
const skills = z.object({
  technicalSkills: strings.optional(), softSkills: strings.optional(),
  languages: strings.optional(), tools: strings.optional()
}).strict();
const jobPreferences = z.object({
  desiredRoles: optional, workAuthorization: optional, availableFrom: optional, remotePreference: optional, workLocation: optional, jobType: optional,
  expectedSalary: optional, noticePeriod: optional, relocate: optional,
  visaSponsorship: optional, preferredIndustries: strings.optional(), travelWillingness: optional
}).strict();

export const profileSchema = z.object({
  firstName: optional, lastName: optional, preferredName: optional, headline: optional, summary: optional,
  phone: optional, dob: optional, gender: optional, nationality: optional, portfolio: optional,
  github: optional, linkedin: optional, address: address.optional(), skills: skills.optional(),
  education: z.array(education).max(100).optional(), experience: z.array(experience).max(100).optional(),
  projects: z.array(project).max(100).optional(), certifications: z.array(certification).max(100).optional(),
  achievements: strings.optional()
}).strict();
export const updateSchema = z.object({
  name: str.trim().min(1).optional(), profile: profileSchema.optional(), jobPreferences: jobPreferences.optional()
}).strict();

export const resumeSchema = profileSchema.omit({ skills: true, experience: true, education: true }).extend({
  fullName: optional, name: optional, email: optional,
  technicalSkills: strings.optional(), softSkills: strings.optional(), tools: strings.optional(), languages: strings.optional(),
  education: z.array(education.omit({ _id: true }).extend({ graduationYear: optional })).max(100).optional(),
  workExperience: z.array(experience.omit({ _id: true }).extend({ isCurrentJob: z.boolean().optional(), achievements: strings.optional() })).max(100).optional(),
  jobPreferences: jobPreferences.optional()
}).strip();
export type ResumeData = z.infer<typeof resumeSchema>;
