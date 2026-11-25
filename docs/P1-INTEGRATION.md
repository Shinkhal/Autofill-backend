# P1 backend integration

Builds on P0 with no required changes to existing request bodies or unpaginated response shapes.

## Answer bank
All endpoints require a bearer token and scope data to the authenticated candidate.
- GET /api/answers?page=1&limit=20&category=general — list with total.
- POST /api/answers — { question, answer, category? }; a normalized duplicate returns 409.
- GET /api/answers/match?question=... — exact normalized question match, or null; requiresReview is always true. The extension can call this explicitly for reusable answers, before requesting an AI draft.
- PUT /api/answers/:id — replace question, answer and optionally category.
- DELETE /api/answers/:id — 204.
Only save candidate-approved answers; review in the current job context before using.

## Application tracker
Existing CRUD at /api/jobs remains. New statuses: Saved, Applied, Interview, Rejected, Offer, Accepted, Withdrawn. Optional location, source, followUpDate (null clears it); new records store statusHistory, and updates supplying status append the new status and timestamp. Existing records have no retroactive history.
- GET /api/jobs?status=Interview&page=1&limit=20 — jobs, total, page, limit.
- GET /api/jobs/stats — total and count per status.
Without page or limit, GET keeps returning an array.

## Job listings
GET /api/listjobs?page=1&limit=20 provides totalJobs, page, limit, totalPages and jobs. Without pagination parameters it returns all results from the fetched provider batch as before.
Results are deduplicated by provider+ID and canonical apply URL (UTM and fragment ignored). With Redis enabled, query results are shared across pages for 300 seconds; failures fall back to provider requests. Provider counts describe pre-deduplication results. Pagination is over the fetched batch, not all positions available at the providers. No additional Redis credentials are required beyond P0 configuration.

## ATS
POST /api/ats/analyze retains score, suggestions and scoring_breakdown, with analysisId, scoringVersion and keywordEvidence added. Keyword alignment is now a deterministic lexical coverage score (30 points) over up to 40 frequent non-stopword terms in the supplied job description. The remaining 70 points use the existing Gemini rubric. This heuristic is advisory, not a prediction of real ATS ranking; it does not infer semantic synonyms or actual layout.
- GET /api/ats/history?page=1&limit=20 — paginated history.
- GET /api/ats/history/:id — analysis.
- DELETE /api/ats/history/:id — 204.
History stores feedback and keyword evidence, not the original PDF or full job description. Successful analyses are saved before returning; quota is refunded on processing failure, including failed history persistence.
New collections and indexes are initialized before readiness. Verify live MongoDB, Redis, job providers and Gemini before production deployment.
