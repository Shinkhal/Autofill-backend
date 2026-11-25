import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, {
  NODE_ENV:'test', MONGODB_URI:'mongodb://localhost:27017/jobautofill',
  JWT_SECRET:'test-only-secret-at-least-32-characters',
  GOOGLE_CLIENT_ID:'test', GOOGLE_CLIENT_SECRET:'test', GOOGLE_GEMINI_API_KEY:'test',
  CLIENT_URL:'http://localhost:3000', SERVER_URL:'http://localhost:5000'
});
const { questionKey, answerSchema } = await import('../dist/schemas/answer.js');
const { keywordEvidence } = await import('../dist/services/atsService.js');
const { deduplicateJobs, listJobs } = await import('../dist/services/listjobs.js');
const { listingQuery } = await import('../dist/schemas/listing.js');
const { jobSchema } = await import('../dist/schemas/job.js');
const { getEnv } = await import('../dist/config/env.config.js');
const { redisConnection } = await import('../dist/config/redis.config.js');

test('Answer bank normalizes exact questions and rejects ownership injection', () => {
  assert.equal(questionKey('  Why   this Role? '), 'why this role');
  assert.equal(answerSchema.safeParse({question:'Why?',answer:'My answer',userId:'other'}).success,false);
});
test('Tracker accepts added statuses and follow-up metadata', () => {
  assert.equal(jobSchema.parse({company:'A',role:'B',status:'Saved',followUpDate:'2026-12-01'}).status,'Saved');
  assert.equal(jobSchema.safeParse({company:'A',role:'B',statusHistory:[]}).success,false);
});
test('Listing deduplication retains distinct posting links', () => {
  assert.equal(deduplicateJobs([
    {source:'Jooble',jobId:1,applyLink:'https://example.com/job?id=1&utm_source=a'},
    {source:'Remotive',jobId:2,applyLink:'https://example.com/job?id=1#apply'},
    {source:'Jooble',jobId:1},
    {source:'Jooble',jobId:3,applyLink:'https://example.com/job?id=2'}
  ]).length,2);
});
test('Pagination shares Redis cache across pages and falls back when Redis fails', async t => {
  let calls=0, cached;
  t.mock.method(getEnv.redis,'enabled',()=>true);
  t.mock.method(redisConnection,'getClient',()=>({
    get:async()=>cached,
    set:async (_key,value,opts)=>{assert.equal(opts.ex,300);cached=value;}
  }));
  t.mock.method(globalThis,'fetch',async url=>{
    calls++;
    if(String(url).includes('jobicy.com')) return new Response(JSON.stringify({jobs:[{id:1,title:'A',location:'India'},{id:2,title:'B',location:'India'}]}));
    throw new Error('Unavailable');
  });
  const first=await listJobs(listingQuery.parse({page:1,limit:1}));
  const initialCalls=calls;
  const second=await listJobs(listingQuery.parse({page:2,limit:1}));
  assert.equal(first.totalJobs,2);
  assert.equal(second.jobs[0].jobId,2);
  assert.equal(calls,initialCalls);
  t.mock.method(redisConnection,'getClient',()=>{throw new Error('Unavailable');});
  assert.equal((await listJobs(listingQuery.parse({query:'other'}))).totalJobs,2);
});
test('ATS keyword coverage counts exact tokens rather than substrings',()=>{
  const result=keywordEvidence('JavaScript Python SQL','Java Python SQL');
  assert.deepEqual(result.matched,['python','sql']);
  assert.deepEqual(result.missing,['java']);
  assert.equal(result.score,20);
});
