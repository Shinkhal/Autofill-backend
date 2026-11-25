# P0 backend integration

This release upgrades Zod to v4 and the Gemini SDK to v3, and implements authentication, candidate profile completion, private resume management, and autofill APIs. Existing MongoDB user fields and business endpoints are preserved. New collections are created for authorization codes, device sessions and resumes. The server initializes their indexes before becoming ready.

## Web authentication migration (required)

1. Navigate to the API's GET /auth/google.
2. The OAuth callback redirects to CLIENT_URL/auth-success#code=... (not token=).
3. Read the fragment using URLSearchParams, then remove it immediately using history.replaceState.
4. POST /auth/exchange with { "code": "...", "client": "web", "deviceName": "Browser" } and credentials: "include".
5. Keep the returned accessToken in memory; API calls use Authorization: Bearer <accessToken>. Do not store the refresh credential in browser JavaScript.
6. POST /auth/refresh with an empty JSON object and credentials: "include" when the access token expires, or on initial application load. The HttpOnly cookie rotates and returns a fresh access token.
7. Serialize refresh calls to avoid replay detection on concurrent uses of one refresh credential. On 401, clear local state and reauthenticate.
8. POST /auth/logout or /auth/logout-all with the bearer and credentials: "include"; clear client state. Sessions can also be listed and revoked individually.

Access tokens expire after 15 minutes. Sessions have a fixed 30-day lifetime and require reauthentication after 4096 rotations. Refresh credentials are random, stored only as hashes, rotated atomically, and reuse of a spent credential revokes that session. Legacy access tokens are rejected. Web cookie-backed operations require the exact configured CLIENT_URL origin. Production cookies are Secure and HttpOnly, and use SameSite=None to support cross-origin deployments; browsers may restrict third-party cookies, so same-site HTTPS deployment is preferable. Refresh is cookie-based only for web sessions.

Example web code:

```ts
const code = new URLSearchParams(location.hash.slice(1)).get('code');
history.replaceState(null, '', location.pathname + location.search);
if (!code) throw new Error('Missing authorization code');
const response = await fetch(API_URL + '/auth/exchange', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code, client: 'web' })
});
if (!response.ok) throw new Error('Authentication failed');
const { accessToken } = await response.json();
```

## Extension authentication

Set EXTENSION_ORIGINS to the actual extension origins, comma separated (e.g. chrome-extension://<extension-id>). The API accepts an explicit extension exchange and refresh credential in JSON. Use the same one-time code flow with client=extension after a user-initiated login handoff. Protect tokens in the extension's privileged background context, never expose them to content scripts or page JavaScript, and serialize refresh operations. The extension-side login handoff/UI is not part of this backend release.

## Candidate profile

GET /api/user/me and PUT /api/user/me use the authenticated identity, not a caller-supplied user ID. Existing /api/user/:id endpoints remain owner-scoped. GET /api/user/me/completion returns percentage, completed, total and missing fields. It scores only core data and doesn't require demographic details. First/last/preferred names, headline, summary, work authorization, availability date, remote preference, and explicit current-employment indicators are supported. A partial profile update preserves unrelated fields.

## Resume management

- POST /api/resume with multipart field resume and optional label to store a PDF without changing the profile.
- GET /api/resume lists metadata; GET /api/resume/:id returns metadata and parsed profile if available.
- POST /api/resume/:id/parse extracts a structured preview via Gemini.
- POST /api/resume/:id/apply applies the saved parsed profile. Review preview before applying; supplied fields replace the corresponding profile data.
- PATCH /api/resume/:id with { "label": "Backend CV" } renames.
- GET /api/resume/:id/download returns an authenticated attachment.
- DELETE /api/resume/:id deletes the stored document.
- Existing POST /api/resume/upload still parses and applies immediately, and now stores the file as well.

Files are private MongoDB documents, not public URLs. There is a 5 MiB per-file limit and a 20-file per-user limit enforced by unique slots. PDF content and parsed content are omitted from list responses. Parsing is synchronous and sends PDF-extracted text to Gemini; configure GEMINI_MODEL to a model available to your account. Long-running background processing and object storage scale-out are later milestones. Do not send documents without the candidate's consent.

## Autofill mapping

POST /api/autofill/map with bearer token and field descriptors. Supported fields include contact, address, links, education, experience, skills and user-stated job preferences. No external web page is fetched or modified. The API returns only requested, matched values, draft suggestions or a manual reason. The extension should show values for review before applying them; never submit applications automatically.

```json
{
  "fields": [
    { "id": "first", "label": "First name", "autocomplete": "given-name" },
    { "id": "email", "label": "Email", "type": "email" },
    { "id": "degree", "label": "Degree", "itemIndex": 0 },
    { "id": "sponsorship", "label": "Visa sponsorship", "type": "select",
      "options": [{ "label": "Yes", "value": "Y" }, { "label": "No", "value": "N" }] }
  ]
}
```

Missing/ambiguous values, conflicting hints, sensitive demographic fields, password/file/hidden fields and checkboxes require manual handling. Multiple education or experience entries require an explicit index; current-employment fields require an explicitly marked current job. Do not infer eligibility or fabricate credentials.

For optional candidate-requested AI drafts: POST /api/autofill/suggest with question, optional jobContext, and factSources (one or more of summary, skills, education, experience, projects). Only the selected career facts are sent to Gemini; review them before requesting a draft. AI output is advisory and requires review. The API returns answer, needsInput and requiresReview. It does not submit forms.

## Validation

Run npm ci, npm run typecheck, npm test, and npm audit. Automated tests use mocked MongoDB and Gemini responses. Before production deployment, verify live Google OAuth, web cookie refresh on your deployed domains, extension handoff, collection/index creation, MongoDB resume upload/download, and the configured Gemini model with actual credentials. No credentials are included.
