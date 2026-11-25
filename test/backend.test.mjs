import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost:27017/jobautofill',
  JWT_SECRET: 'test-only-secret-at-least-32-characters',
  GOOGLE_CLIENT_ID: 'test',
  GOOGLE_CLIENT_SECRET: 'test',
  GOOGLE_GEMINI_API_KEY: 'test',
  CLIENT_URL: 'http://localhost:3000',
  SERVER_URL: 'http://localhost:5000'
});
const { createApp } = await import('../dist/app.js');
const { signToken, verifyToken } = await import('../dist/services/tokenService.js');
const { updateSchema, resumeSchema } = await import('../dist/schemas/profile.js');
const { buildProfileUpdate, resumeUpdate } = await import('../dist/utils/profile-update.js');
const { extractTextFromPDF } = await import('../dist/services/pdfParser.js');
const { requireOwner } = await import('../dist/middlewares/authMiddleware.js');

let server;
let base;
before(async () => {
  server = createApp(new session.MemoryStore()).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });

test('Root API remains compatible', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'API is running...');
});

test('Health endpoint reports unavailable without MongoDB', async () => {
  const response = await fetch(base + '/health');
  assert.equal(response.status, 503);
});

test('JWT round trip uses consistent claims', () => {
  const id = '507f1f77bcf86cd799439011';
  assert.equal(verifyToken(signToken({ id, email: 'test@example.com', name: 'Test' })), id);
  assert.throws(() => verifyToken('invalid'));
});

test('Protected routes reject unauthenticated requests', async () => {
  const response = await fetch(base + '/api/user/507f1f77bcf86cd799439011');
  assert.equal(response.status, 401);
});

test('Profile access is scoped to owner', () => {
  const req = { authenticatedUser: { _id: '507f1f77bcf86cd799439011' }, params: { id: '507f1f77bcf86cd799439012' } };
  assert.throws(() => requireOwner(req, {}, () => {}), { status: 403 });
  req.params.id = req.authenticatedUser._id;
  let called = false;
  requireOwner(req, {}, () => { called = true; });
  assert.equal(called, true);
});

test('Partial updates preserve unrelated profile fields', () => {
  assert.deepEqual(buildProfileUpdate(updateSchema.parse({ profile: { phone: '123' } })), { 'profile.phone': '123' });
});

test('Account identity fields are excluded from profile updates', () => {
  assert.equal(updateSchema.safeParse({ email: 'changed@example.com' }).success, false);
});

test('Resume fullName and graduationYear map to persisted schema', () => {
  const update = resumeUpdate(resumeSchema.parse({fullName:'Candidate',education:[{institution:'University',graduationYear:'2026'}]}));
  assert.equal(update.name, 'Candidate');
  assert.equal(update['profile.education'][0].endDate, '2026');
  assert.equal('profile.skills.technicalSkills' in update, false);
});

test('Malformed AI output fails validation', () => {
  assert.equal(resumeSchema.safeParse({ technicalSkills: 'Python' }).success, false);
});

test('Non-PDF uploads fail validation', async () => {
  await assert.rejects(extractTextFromPDF(Buffer.from('not a PDF')), { status: 400 });
});

test('Unknown routes return a JSON 404', async () => {
  const response = await fetch(base + '/unknown');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: 'Route not found' });
});

test('Google OAuth initiation sets state and redirects', async () => {
  const response = await fetch(base + '/auth/google', { redirect: 'manual' });
  assert.equal(response.status, 302);
  const destination = new URL(response.headers.get('location'));
  assert.ok(destination.searchParams.get('state'));
  assert.ok(response.headers.get('set-cookie')?.includes('autofill.oauth'));
});

test('CORS response uses configured client origin', async () => {
  const response = await fetch(base, { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
});

test('PDF parser extracts text from a valid single-page document', async () => {
  const stream = 'BT /F1 12 Tf 72 720 Td (Sample resume) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
  });
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  assert.match(await extractTextFromPDF(Buffer.from(pdf)), /Sample resume/);
});

const { jobSchema, jobUpdateSchema } = await import('../dist/schemas/job.js');
const { listingQuery, salaryQuery } = await import('../dist/schemas/listing.js');
const { normalizeJob, listJobs } = await import('../dist/services/listjobs.js');
const { normalizeATSFeedback } = await import('../dist/schemas/ats.js');
const { analyzeResume } = await import('../dist/controllers/atsController.js');
const { default: User } = await import('../dist/models/User.js');
const { JobApplication } = await import('../dist/models/JobApplication.js');

test('New feature endpoints require authentication', async () => {
  for (const [path, method] of [['/api/jobs','GET'], ['/api/jobs','POST'], ['/api/listjobs','GET'], ['/api/listjobs/salaries','GET'], ['/api/listjobs/jsearch/123','GET'], ['/api/ats/analyze','POST']]) {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, 401, path);
  }
});

test('Job applications validate status and disallow owner injection', () => {
  assert.equal(jobSchema.safeParse({ company:'ACME', role:'Engineer' }).success, true);
  assert.equal(jobSchema.safeParse({ company:'ACME', role:'Engineer', userId:'123' }).success, false);
  assert.equal(jobUpdateSchema.safeParse({ status:'invalid' }).success, false);
  assert.equal(jobUpdateSchema.safeParse({ userId:'changed' }).success, false);
});

test('Authenticated job creation binds owner on server', async t => {
  const id = '507f1f77bcf86cd799439011';
  t.mock.method(User, 'findById', async () => ({ _id: id }));
  let saved;
  t.mock.method(JobApplication, 'create', async data => { saved = data; return data; });
  const response = await fetch(base + '/api/jobs', {
    method:'POST', headers:{ Authorization:'Bearer '+signToken({id,email:'test@example.com',name:'Test'}), 'Content-Type':'application/json' },
    body:JSON.stringify({company:'ACME',role:'Developer'})
  });
  assert.equal(response.status, 201);
  assert.equal(saved.userId, id);
});

test('Job listing filters validate query values', () => {
  assert.equal(listingQuery.parse({}).radius, 25);
  assert.equal(listingQuery.safeParse({ radius:'-5' }).success, false);
  assert.equal(listingQuery.safeParse({ query:['x','y'] }).success, false);
  assert.equal(salaryQuery.safeParse({}).success, false);
});

test('Provider normalizers preserve IDs and strip HTML descriptions', () => {
  assert.deepEqual(normalizeJob('jooble',{id:1, company:'ACME', title:'Engineer', snippet:'<b>Role</b>', link:'https://example.com/job'}).description, 'Role');
  assert.equal(normalizeJob('jsearch',{job_title:'Missing ID'}), null);
  assert.equal(normalizeJob('remotive',{id:2,url:'javascript:alert(1)'}).applyLink, undefined);
  assert.equal(normalizeJob('jobicy',{id:3,jobTitle:'Engineer',jobGeo:'India'}).role, 'Engineer');
});

test('Job search returns successful providers when other providers fail', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('jobicy.com')) return new Response(JSON.stringify({ jobs:[{id:7,title:'Engineer', location:'India'}] }), { status:200 });
    throw new Error('Unavailable');
  });
  const result = await listJobs(listingQuery.parse({}));
  assert.equal(result.totalJobs, 1);
  assert.equal(result.sources.jobicy, 1);
  assert.equal(result.sources.remotive, 0);
});

test('ATS scores match weighted breakdown and reject invalid data', () => {
  const feedback = { score:99, suggestions:['Describe your relevant experience clearly.', 'Improve evidence of technical skills.', 'Use more specific outcome descriptions.'], scoring_breakdown: { keyword_alignment:20, experience_match:15, skill_coverage:10, achievement_quantification:5, format_compliance:5 } };
  assert.equal(normalizeATSFeedback(feedback).score, 55);
  assert.throws(() => normalizeATSFeedback({...feedback, scoring_breakdown:{...feedback.scoring_breakdown,keyword_alignment:31}}));
});

test('ATS quota prevents analysis when reservation is unavailable', async t => {
  t.mock.method(User, 'updateOne', async () => ({ matchedCount: 1 }));
  t.mock.method(User, 'findOneAndUpdate', async () => null);
  let status, body;
  const response = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  await analyzeResume({ authenticatedUser:{_id:'507f1f77bcf86cd799439011'}, file:{buffer:Buffer.from('pdf')},body:{ jd:'A detailed role description requiring software engineering experience and skills.' } }, response, () => {});
  assert.equal(status, 400);
  assert.equal(body.code, 'FREE_LIMIT_REACHED');
});

const { createHttpServer, closeHttpServer } = await import('../dist/server.js');

test('Liveness is distinct from database readiness', async () => {
  assert.equal((await fetch(base + '/health/live')).status, 200);
  assert.equal((await fetch(base + '/health/ready')).status, 503);
});

test('Sensitive endpoints and health probes are not cacheable; requests have IDs', async () => {
  const response = await fetch(base + '/api/jobs');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
  const health = await fetch(base + '/health');
  assert.equal(health.headers.get('cache-control'), 'no-store');
});

test('Readiness is disabled and new API work rejected while draining', async () => {
  let draining = false;
  const instance = createHttpServer(createApp(new session.MemoryStore(), {
    isReady: () => true,
    isDraining: () => draining
  }));
  instance.listen(0, '127.0.0.1');
  await new Promise(resolve => instance.once('listening', resolve));
  const url = 'http://127.0.0.1:' + instance.address().port;
  try {
    assert.equal((await fetch(url + '/health/ready')).status, 200);
    draining = true;
    assert.equal((await fetch(url + '/health/ready')).status, 503);
    assert.equal((await fetch(url + '/health/live')).status, 200);
    const response = await fetch(url + '/api/jobs');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('connection'), 'close');
  } finally {
    await closeHttpServer(instance);
  }
});

test('Closing HTTP server lets an active response finish', async () => {
  const { default: express } = await import('express');
  const app = express();
  let release, entered;
  const active = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  app.get('/slow', async (_req, res) => {
    entered();
    await gate;
    res.send('completed');
  });
  const instance = createHttpServer(app);
  instance.listen(0, '127.0.0.1');
  await new Promise(resolve => instance.once('listening', resolve));
  const response = fetch('http://127.0.0.1:' + instance.address().port + '/slow');
  await active;
  let closed = false;
  const closing = closeHttpServer(instance).then(() => { closed = true; });
  assert.equal(closed, false);
  release();
  assert.equal(await (await response).text(), 'completed');
  await closing;
  assert.equal(closed, true);
});
