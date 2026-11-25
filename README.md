# Autofill Backend

TypeScript REST API for Job Autofill. It authenticates candidates via Google OAuth, manages candidate profiles and tracked job applications in MongoDB, extracts profile information from PDF resumes using Gemini, provides ATS feedback, and aggregates job listings and salary estimates.

## Stack

- Node.js 22.3+, Express 5, strict TypeScript (ES modules)
- MongoDB and Mongoose
- Passport Google OAuth 2.0, JWT bearer authentication
- Gemini, PDF parsing, Multer
- Zod validation, Helmet, MongoDB-backed OAuth sessions

## Getting started

1. Install Node.js 22.3 or later and configure MongoDB.
2. Run `npm ci`.
3. Copy `.env.example` to `.env`.
4. Set Google OAuth credentials, Gemini API key, MongoDB URI and random secrets (32 characters or longer). Register `SERVER_URL/auth/google/callback` in your Google OAuth configuration.
5. Optionally set RAPIDAPI_KEY and JOOBLE_API_KEY for job search integrations.
6. Run `npm run dev`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | TypeScript watch mode |
| `npm run typecheck` | Check types |
| `npm run build` | Compile into dist/ |
| `npm start` | Run compiled API |
| `npm test` | Compile and execute regression tests |

## API

| Method | Endpoint | Authentication |
| --- | --- | --- |
| GET | / | Public |
| GET | /health | Public; database readiness |
| GET | /auth/google | Google OAuth initiation |
| GET | /auth/google/callback | Google OAuth callback |
| GET | /api/user/:id | JWT; owner only |
| PUT | /api/user/:id | JWT; owner only |
| POST | /api/resume/upload | JWT; multipart PDF under resume field (5 MiB max) |
| GET | /api/jobs | JWT; list owned job applications |
| POST | /api/jobs | JWT; create tracked job |
| GET | /api/jobs/:id | JWT; owner only |
| PUT | /api/jobs/:id | JWT; owner only |
| DELETE | /api/jobs/:id | JWT; owner only |
| GET | /api/listjobs | JWT; aggregated job listings |
| GET | /api/listjobs/salaries | JWT; JSearch salary estimates |
| GET | /api/listjobs/:source/:id | JWT; provider-specific listing |
| POST | /api/ats/analyze | JWT; multipart resume PDF and jd fields |

Send protected requests with `Authorization: Bearer <token>`. Profile updates accept name, profile and jobPreferences; account identity fields are not editable. Nested object updates preserve unspecified fields. Arrays replace the supplied array in full.

## Architecture

- `src/server.ts`: startup, database connection and graceful shutdown
- `src/app.ts`: HTTP application and middleware
- `src/config/`: validated environment, database and OAuth configuration
- `src/routes/` and `src/controllers/`: routing and HTTP logic
- `src/services/`: token signing, resume parsing and external AI calls
- `src/models/`: MongoDB models with inferred document types
- `src/schemas/`: runtime payload and AI-output schemas
- `src/middlewares/`: authentication, authorization and error handling
- `src/utils/` and `src/types/`: shared helpers and types
- `test/`: automated regression tests

## Deployment and migration

Build with `npm ci && npm run build`, then run `npm start` with production environment variables. Use HTTPS and configure TRUST_PROXY only to match your trusted reverse proxy topology. Restrict CORS to CLIENT_URL. Use HTTPS for Google callback URLs in production.

The MongoDB database name and existing model fields remain compatible; an optional resumeChecksMonth field enables monthly ATS quota resets. Existing resumeChecks values count toward the month of first use after migration. Existing JWTs signed with the original id claim continue to work if the same secret is retained. OAuth state is now stored in a short-lived MongoDB-backed session. The original frontend redirect to /auth-success?token=... is retained for compatibility; migrate to a short-lived, single-use exchange flow in coordination with the frontend to eliminate tokens in URLs. Do not log URLs containing JWTs. Resume text is sent to Gemini; ensure candidates are informed and appropriate data-handling settings are configured.

The default Gemini model is retained from Phase 1; set GEMINI_MODEL to a currently available model for your account. Automated tests use dummy credentials; real Google OAuth, MongoDB writes and Gemini calls require a configured integration environment.

A multi-stage Dockerfile is included for container deployments. OAuth and upload rate limits are process-local; use a shared rate-limiting store or gateway when deploying multiple replicas.


## ATS analysis and job search

ATS analysis compares resume text with a job description and returns a score, suggestions and weighted scoring breakdown. It is advisory feedback, not a guarantee of hiring outcomes. The five-check quota is enforced atomically per UTC calendar month. Failed analyses release reservations; an interrupted process can leave a reservation counted until the next month.

The listing service normalizes JSearch, Jobicy, Remotive and Jooble data. Providers are fetched concurrently with timeouts; successful responses remain available if some providers fail. Optional provider keys may be left empty. Jobicy, Remotive and Jooble details depend on whether the requested listing is present in the provider's returned search results. Descriptions are delivered as plain text rather than provider HTML. Frontends must render untrusted text safely.

The InterviewProgress model is migrated, but the upstream interview controller was empty and no interview endpoints were implemented. Test coverage includes mocked job providers and database methods, not live integrations.

## Runtime lifecycle

The server connects to MongoDB and verifies that the OAuth session store can be
read (including its TTL index initialization) before binding the HTTP port.
Startup failures exit nonzero. HTTP header and request-body reception have
15-second and 60-second timeouts, respectively; keep-alive is 5 seconds.
These reception timeouts do not impose a processing deadline on AI calls.

Use GET /health/live for process liveness and GET /health/ready (or the
existing GET /health) for readiness. Readiness requires startup to finish
and the Mongoose connection to be connected. Probes are not rate limited.

On SIGINT or SIGTERM, readiness is disabled, new application work is rejected
with HTTP 503, and the server stops accepting connections. Active HTTP
requests are allowed to finish before both MongoDB connections close. The
shutdown deadline is 30 seconds; configure the hosting platform's termination
grace period accordingly. Fatal startup/runtime errors exit nonzero.

Request logs contain a generated request ID, HTTP method, status and duration,
but never raw URLs, query parameters, authorization headers or resume contents.
The same request ID is returned in X-Request-ID. Auth and API responses are
marked no-store. Existing endpoint paths and response bodies are preserved.

## Configuration layer

Environment values are accessed through the validated, grouped `getEnv`
API in `src/config/env.config.ts`; no secrets appear in the startup summary.
The remaining configuration files manage the Mongoose singleton, Upstash
Redis, Passport and the OAuth session store. Pino emits structured JSON logs
through `src/utils/logger.util.ts`. Set LOG_LEVEL to override the environment
default.

MongoDB remains the application database. MONGODB_DB_NAME defaults to
jobautofill and is shared with the session store. The database config provides
bounded connection retries, a connection status accessor, a ping health
check and cleanup.

Redis is optional for the existing features. Set both UPSTASH_REDIS_REST_URL
and UPSTASH_REDIS_REST_TOKEN to enable the HTTP client; startup then checks
Redis connectivity. UPSTASH_REDIS_TCP_URL is optional for future consumers;
production requires a rediss:// URL with verified TLS. The Redis singleton
creates TCP connections lazily, provides separate named blocking clients,
a subscriber and a queue producer, and closes every created client during
shutdown. No workers or Redis-based caching/rate limiting are enabled yet.

```ts
import { getEnv } from './config/env.config.js';
import { redisConnection } from './config/redis.config.js';

const port = getEnv.app.port();
// Configure the relevant Redis credentials before requesting a client.
const cache = redisConnection.getClient();
const worker = redisConnection.getBlockingClient('resume');
const producer = redisConnection.getQueueClient();
```
