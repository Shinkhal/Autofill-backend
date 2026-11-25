import { z } from 'zod';
import striptags from 'striptags';
import { logger } from '../utils/logger.util.js';
import { getEnv } from '../config/env.config.js';
import { HttpError } from '../utils/http-error.js';
import type { ListingQuery, SalaryQuery, ProviderSource } from '../schemas/listing.js';

const rowSchema = z.record(z.unknown());
type ProviderRow = z.infer<typeof rowSchema>;
type Listing = Record<string, unknown> & { source: string; jobId: string | number };

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function clean(value: unknown): string | undefined {
  const description = text(value);
  return description === undefined ? undefined : striptags(description);
}
function safeLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { return /^https?:$/.test(new URL(value).protocol) ? value : undefined; } catch { return undefined; }
}
function identifier(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

async function fetchRows(url: URL, key: string, init?: RequestInit): Promise<ProviderRow[]> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new HttpError(502, 'Job provider unavailable');
  const parsed = rowSchema.safeParse(await response.json());
  if (!parsed.success || !Array.isArray(parsed.data[key])) throw new HttpError(502, 'Invalid job provider response');
  return z.array(rowSchema).parse(parsed.data[key]);
}

function rapidHeaders(): Record<string, string> {
  const key = getEnv.jobs.rapidApiKey();
  if (!key) throw new HttpError(503, 'JSearch is not configured');
  return { 'x-rapidapi-key': key, 'x-rapidapi-host': 'jsearch.p.rapidapi.com' };
}
function jooble(query: string, location: string): Promise<ProviderRow[]> {
  const key = getEnv.jobs.joobleApiKey();
  if (!key) return Promise.reject(new HttpError(503, 'Jooble is not configured'));
  return fetchRows(new URL('https://jooble.org/api/' + encodeURIComponent(key)), 'jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: query, location })
  });
}
function jsearch(path: string, params: Record<string, string>): Promise<ProviderRow[]> {
  if (!getEnv.jobs.rapidApiKey()) return Promise.reject(new HttpError(503, 'JSearch is not configured'));
  const url = new URL(path, 'https://jsearch.p.rapidapi.com');
  url.search = new URLSearchParams(params).toString();
  return fetchRows(url, 'data', { headers: rapidHeaders() });
}
function remoteUrl(query = ''): URL {
  const url = new URL('https://remotive.com/api/remote-jobs');
  if (query) url.searchParams.set('search', query);
  return url;
}

export function normalizeJob(source: ProviderSource, job: ProviderRow): Listing | null {
  const id = source === 'jsearch' ? job.job_id : job.id;
  if (!identifier(id)) return null;
  switch (source) {
    case 'jsearch': return {
      source: 'JSearch',
      jobId: id,
      company: job.employer_name,
      companyLogo: safeLink(job.employer_logo),
      companyWebsite: safeLink(job.employer_website),
      companyType: job.employer_company_type,
      role: job.job_title,
      location: job.job_city || job.job_country,
      country: job.job_country,
      state: job.job_state,
      city: job.job_city,
      description: clean(job.job_description),
      highlights: job.job_highlights,
      qualifications: job.job_qualifications,
      responsibilities: job.job_responsibilities,
      benefits: job.job_benefits,
      applyLink: safeLink(job.job_apply_link),
      postedDate: job.job_posted_at_datetime_utc,
      expirationDate: job.job_offer_expiration_datetime_utc,
      employmentType: job.job_employment_type,
      jobRequiredExperience: job.job_required_experience,
      jobRequiredSkills: job.job_required_skills,
      jobRequiredEducation: job.job_required_education,
      isRemote: job.job_is_remote,
      salaryMin: job.job_min_salary,
      salaryMax: job.job_max_salary,
      salaryCurrency: job.job_salary_currency,
      salaryPeriod: job.job_salary_period,
      jobGoogleLink: safeLink(job.job_google_link),
      jobOfferExpirationTimestamp: job.job_offer_expiration_timestamp,
      jobPostedAtTimestamp: job.job_posted_at_timestamp,
      estimatedSalaries: job.estimated_salaries,
      applyOptions: job.apply_options,
      relatedLinks: job.related_links
    };
    case 'jobicy': return {
      source: 'Jobicy',
        jobId: id,
        company: job.company_name ?? job.companyName,
        companyLogo: safeLink(job.company_logo ?? job.companyLogo),
        role: job.title ?? job.jobTitle,
        location: job.location ?? job.jobGeo,
        description: clean(job.description ?? job.jobDescription),
        jobType: job.job_type ?? job.jobType,
        category: job.category ?? job.jobIndustry,
        applyLink: safeLink(job.url),
        postedDate: job.posted_at ?? job.pubDate,
        updatedDate: job.updated_at,
        tags: job.tags,
        salary: job.salary,
        isActive: job.is_active,
      requirements: job.requirements,
      benefits: job.benefits
    };
    case 'remotive': return {
      source: 'Remotive',
        jobId: id,
        company: job.company_name,
        companyLogo: safeLink(job.company_logo),
        companyLogoUrl: safeLink(job.company_logo_url),
        role: job.title,
        location: job.candidate_required_location,
        description: clean(job.description),
        applyLink: safeLink(job.url),
        postedDate: job.publication_date,
        category: job.category,
        jobType: job.job_type,
        salary: job.salary,
        tags: job.tags,
        companyDescription: job.company_description,
        relativeLocation: job.relative_location,
        candidateRequiredLocation: job.candidate_required_location
    };
    case 'jooble': return {
      source: 'Jooble',
        jobId: id,
        company: job.company,
        role: job.title,
        location: job.location,
        description: clean(job.snippet),
        applyLink: safeLink(job.link),
        postedDate: job.updated,
        salary: job.salary,
        type: job.type,
        source_website: job.source
    };
  }
}

export async function listJobs(query: ListingQuery) {
  const params: Record<string, string> = {
    query: [query.query, query.location].filter(Boolean).join(' '),
    num_pages: '1', country: 'in', date_posted: 'all', radius: String(query.radius)
  };
  if (query.work_from_home === 'true') params.remote_jobs_only = 'true';
  for (const key of ['employment_types', 'job_requirements', 'company_types'] as const) {
    if (query[key]) params[key] = query[key];
  }
  const providers = ['jsearch', 'jobicy', 'remotive', 'jooble'] as const;
  const results = await Promise.allSettled([
    jsearch('/search', params),
    fetchRows(new URL('https://jobicy.com/api/v2/remote-jobs'), 'jobs'),
    fetchRows(remoteUrl(query.query), 'jobs'),
    jooble(query.query, query.location || 'India')
  ]);
  const sources = { jsearch: 0, jobicy: 0, remotive: 0, jooble: 0 };
  const jobs: Listing[] = [];
  let successful = 0;
  results.forEach((result, index) => {
    const source = providers[index]!;
    if (result.status === 'rejected') {
      logger.warn({ event: 'job.provider.unavailable', source });
      return;
    }
    successful++;
    const candidates = result.value.map(row => normalizeJob(source, row)).filter((job): job is Listing => job !== null);
    const selected = source === 'jsearch' ? candidates : candidates.filter(job => {
      const location = job.location;
      return typeof location === 'string' && location.toLowerCase().includes('india');
    });
    sources[source] = selected.length;
    jobs.push(...selected);
  });
  if (!successful) throw new HttpError(502, 'All job providers unavailable');
  return { success: true, totalJobs: jobs.length, jobs, sources };
}

export async function getListing(source: ProviderSource, id: string): Promise<Listing> {
  let rows: ProviderRow[];
  switch (source) {
    case 'jsearch': rows = await jsearch('/job-details', { job_id: id }); break;
    case 'jobicy': rows = await fetchRows(new URL('https://jobicy.com/api/v2/remote-jobs'), 'jobs'); break;
    case 'remotive': rows = await fetchRows(remoteUrl(), 'jobs'); break;
    case 'jooble': rows = await jooble('', 'India'); break;
  }
  const job = rows.map(row => normalizeJob(source, row)).find(candidate => candidate && String(candidate.jobId) === id);
  if (!job) throw new HttpError(404, 'Job not found in provider');
  return job;
}

export async function getSalaries(query: SalaryQuery) {
  return jsearch('/estimated-salary', { job_title: query.job_title, location: query.location, radius: String(query.radius) });
}
