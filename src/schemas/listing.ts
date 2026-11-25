import { z } from 'zod';
const queryString = z.string().trim().max(250);
const radius = z.coerce.number().int().min(1).max(500);
export const listingQuery = z.object({
  query: queryString.min(1).default('developer'),
  location: queryString.default(''),
  work_from_home: z.enum(['true', 'false']).default('false'),
  employment_types: queryString.default(''),
  job_requirements: queryString.default(''),
  company_types: queryString.default(''),
  radius: radius.default(25),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});
export const salaryQuery = z.object({
  job_title: queryString.min(1),
  location: queryString.default('India'),
  radius: radius.default(100)
});
export const providerSource = z.enum(['jsearch', 'jobicy', 'remotive', 'jooble']);
export type ProviderSource = z.infer<typeof providerSource>;
export type ListingQuery = z.infer<typeof listingQuery>;
export type SalaryQuery = z.infer<typeof salaryQuery>;
