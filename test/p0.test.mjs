import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import mongoose from 'mongoose';

Object.assign(process.env, {
  NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017/jobautofill',
  JWT_SECRET: 'test-only-secret-at-least-32-characters',
  GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test', GOOGLE_GEMINI_API_KEY: 'test',
  CLIENT_URL: 'http://localhost:3000', SERVER_URL: 'http://localhost:5000',
  EXTENSION_ORIGINS: 'chrome-extension://example',
  UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', UPSTASH_REDIS_TCP_URL: ''
});
const { createApp } = await import('../dist/app.js');
const { AuthCode } = await import('../dist/models/AuthCode.js');
const { AuthSession } = await import('../dist/models/AuthSession.js');
const { Resume } = await import('../dist/models/Resume.js');
const { default: User } = await import('../dist/models/User.js');
const { hashCredential, issueAuthCode, decodeRefreshToken } = await import('../dist/services/authService.js');
const { signToken, verifyToken } = await import('../dist/services/tokenService.js');
const { profileCompletion } = await import('../dist/services/profileService.js');
const { mapFields } = await import('../dist/services/autofillService.js');
const { autofillSchema } = await import('../dist/schemas/autofill.js');
const { storeResume } = await import('../dist/services/resumeService.js');
const { selectedFacts } = await import('../dist/services/answerSuggestionService.js');

const ownerId = '507f1f77bcf86cd799439011';
const sessionId = '507f1f77bcf86cd799439012';
const origin = 'http://localhost:3000';
const user = new User({
  _id: ownerId, googleId:'test', name:'Example Person', email:'person@example.test',
  profile:{ firstName:'Example', lastName:'Person', phone:'123', skills:{technicalSkills:['Python']},
    address:{city:'Gaya',country:'India'}, education:[{degree:'B.Tech',institution:'University'},{degree:'PG Diploma',institution:'Institute'}] },
  jobPreferences:{ desiredRoles:'Developer', workLocation:'Bengaluru', visaSponsorship:'Yes' }
});
let server, base;
before(async () => {
  server = createApp(new session.MemoryStore()).listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });
const authHeader = () => ({ Authorization:'Bearer '+signToken({id:ownerId,email:user.email,name:user.name}, sessionId) });
const jsonPost = (path, body, headers={}) => fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('Authorization code is random, hashed at rest and expires quickly', async t => {
  let record;
  t.mock.method(AuthCode,'create',async value=>{record=value;return value;});
  const code = await issueAuthCode(user._id);
  assert.equal(code.length, 43);
  assert.equal(record.hash, hashCredential(code));
  assert.notEqual(record.hash, code);
  assert.ok(record.expiresAt.getTime() - Date.now() <= 60000);
});

test('Web exchange consumes a code once, sets HttpOnly refresh cookie and issues short-lived JWT', async t => {
  const code = 'a'.repeat(43);
  let consumed = false, created;
  t.mock.method(AuthCode,'findOneAndDelete',async filter=>{
    assert.equal(filter.hash,hashCredential(code));
    assert.ok(filter.expiresAt.$gt instanceof Date);
    if (consumed) return null; consumed=true; return {userId:user._id};
  });
  t.mock.method(User,'findById',async()=>user);
  t.mock.method(AuthSession,'create',async value=>{created=value;return value;});
  const response = await jsonPost('/auth/exchange',{code,client:'web'},{Origin:origin});
  assert.equal(response.status,200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie,/autofill\.refresh=/);
  assert.match(cookie,/HttpOnly/i);
  const body=await response.json();
  assert.equal(body.expiresIn,900);
  assert.equal(body.refreshToken,undefined);
  assert.equal(verifyToken(body.accessToken).sid,created._id.toString());
  const raw=decodeURIComponent(cookie.match(/autofill\.refresh=([^;]+)/)[1]);
  assert.equal(created.refreshHash,hashCredential(raw));
  assert.equal((await jsonPost('/auth/exchange',{code,client:'web'},{Origin:origin})).status,401);
});

test('Web exchange and cookie refresh reject untrusted origins before database calls', async () => {
  assert.equal((await jsonPost('/auth/exchange',{code:'a'.repeat(43),client:'web'},{Origin:'https://example.test'})).status,403);
  assert.equal((await jsonPost('/auth/refresh',{}, {Origin:'https://example.test',Cookie:'autofill.refresh=test'})).status,403);
});

test('Extension refresh rotates credential and rejects a replay', async t => {
  let current = sessionId+'.'+'a'.repeat(43), used, revoked=false;
  t.mock.method(User,'findById',async()=>user);
  t.mock.method(AuthSession,'findOneAndUpdate',async(filter, update)=>{
    if (revoked || filter.refreshHash !== hashCredential(current)) return null;
    used=update.$push.usedHashes;
    // Return the session and rely on another update to check the captured hash.
    return { userId:user._id, expiresAt:new Date(Date.now()+60000) };
  });
  t.mock.method(AuthSession,'updateOne',async(filter)=>{
    if (filter.usedHashes === used) revoked=true;
    return {matchedCount:revoked?1:0};
  });
  const old=current;
  const result=await jsonPost('/auth/refresh',{refreshToken:old},{Origin:'chrome-extension://example'});
  assert.equal(result.status,200);
  current=(await result.json()).refreshToken;
  assert.notEqual(current,old);
  assert.equal(decodeRefreshToken(current).id,sessionId);
  const replay=await jsonPost('/auth/refresh',{refreshToken:old},{Origin:'chrome-extension://example'});
  assert.equal(replay.status,401);
  assert.equal(revoked,true);
});

test('Revoked session blocks even an otherwise-valid access token', async t => {
  t.mock.method(AuthSession,'exists',async()=>null);
  assert.equal((await fetch(base+'/auth/me',{headers:authHeader()})).status,401);
});

test('Session logout is scoped to authenticated owner and device', async t => {
  let filter;
  t.mock.method(AuthSession,'exists',async()=>({_id:sessionId}));
  t.mock.method(User,'findById',async()=>user);
  t.mock.method(AuthSession,'updateOne',async value=>{filter=value;return {matchedCount:1};});
  const result=await jsonPost('/auth/logout',{},authHeader());
  assert.equal(result.status,204);
  assert.equal(filter._id,sessionId);
  assert.equal(filter.userId,ownerId);
});

test('Profile completeness counts meaningful candidate fields without sensitive demographics', () => {
  const result=profileCompletion(user);
  assert.equal(result.percentage,100);
  assert.ok(!result.missing.includes('profile.gender'));
});

test('Autofill mapping returns reviewed values, skips ambiguous and unknown fields', () => {
  const input=autofillSchema.parse({fields:[
    {id:'email',label:'Email',type:'email'},
    {id:'first',name:'firstName',autocomplete:'given-name'},
    {id:'degree',label:'Degree'},
    {id:'specific',label:'Degree',itemIndex:1},
    {id:'conflict',label:'Last Name',name:'firstName'},
    {id:'protected',label:'Gender'},
    {id:'hidden',label:'Email',type:'hidden'},
    {id:'visa',label:'Visa Sponsorship',type:'select', options:[{label:'Yes',value:'y'},{label:'No',value:'n'}]},
    {id:'open',label:'Tell us about yourself',type:'textarea'}
  ]});
  const result=mapFields(user,input.fields);
  assert.equal(result.matched,4);
  assert.equal(result.manual,4);
  assert.equal(result.suggestions,1);
  assert.equal(result.results.find(row=>row.id==='visa').value,'y');
  assert.equal(result.results.find(row=>row.id==='specific').value,'PG Diploma');
  assert.equal(result.results.find(row=>row.id==='open').requiresReview,true);
  assert.equal(autofillSchema.safeParse({fields:[{id:'a'},{id:'a'}]}).success,false);
});

test('AI facts contain selected profile data only, not account identifiers', () => {
  const facts=selectedFacts(user,['skills']);
  assert.deepEqual(JSON.parse(JSON.stringify(facts)),{skills:['Python']});
  assert.ok(!JSON.stringify(facts).includes(user.email));
});

test('Private PDF storage reserves a per-user slot and returns metadata only', async t => {
  t.mock.method(Resume,'find',()=>({select(){return this;},lean:async()=>[{slot:0}]}));
  let captured;
  t.mock.method(Resume,'create',async data=>{captured=data;return {...data,_id:new mongoose.Types.ObjectId()};});
  const file={buffer:Buffer.from('%PDF-1.7 test'),originalname:'../my.pdf'};
  const result=await storeResume(ownerId,file,'Backend CV');
  assert.equal(captured.userId,ownerId);
  assert.equal(captured.slot,1);
  assert.equal(result.label,'Backend CV');
  assert.equal('content' in result,false);
  assert.ok(!result.originalName.includes('/'));
});

test('Private resume storage rejects non-PDF and enforces 20-slot limit', async t => {
  await assert.rejects(storeResume(ownerId,{buffer:Buffer.from('x'),originalname:'x.pdf'}),{status:400});
  t.mock.method(Resume,'find',()=>({select(){return this;},lean:async()=>Array.from({length:20},(_,slot)=>({slot}))}));
  await assert.rejects(storeResume(ownerId,{buffer:Buffer.from('%PDF-1.7 test'),originalname:'x.pdf'}),{status:409});
});

test('Resume retrieval uses owner filter and excludes content by default', async t => {
  let filter;
  t.mock.method(AuthSession,'exists',async()=>({_id:sessionId}));
  t.mock.method(User,'findById',async()=>user);
  t.mock.method(Resume,'findOne',value=>{filter=value;return {select:async()=>null};});
  const response=await fetch(base+'/api/resume/'+sessionId,{headers:authHeader()});
  assert.equal(response.status,404);
  assert.equal(filter.userId.toString(),ownerId);
});

test('Autofill and profile completion APIs cannot be used without authentication', async () => {
  assert.equal((await jsonPost('/api/autofill/map',{fields:[{id:'email',label:'Email'}]})).status,401);
  assert.equal((await fetch(base+'/api/user/me/completion')).status,401);
});

test('Web refresh rotates the cookie without exposing refresh token in response', async t => {
  const old = sessionId+'.'+'a'.repeat(43);
  let nextHash;
  t.mock.method(User,'findById',async()=>user);
  t.mock.method(AuthSession,'findOneAndUpdate',async(filter,update)=>{
    assert.equal(filter.client,'web');
    assert.equal(filter.refreshHash,hashCredential(old));
    nextHash=update.$set.refreshHash;
    return {userId:user._id,expiresAt:new Date(Date.now()+60000)};
  });
  const response=await jsonPost('/auth/refresh',{}, {Origin:origin,Cookie:'autofill.refresh='+old});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.refreshToken,undefined);
  const cookie=response.headers.get('set-cookie');
  const next=decodeURIComponent(cookie.match(/autofill\.refresh=([^;]+)/)[1]);
  assert.notEqual(next,old);
  assert.equal(hashCredential(next),nextHash);
});

test('Upgraded Gemini SDK parses structured resume, ATS and candidate suggestion responses', async t => {
  const { parseResumeWithAI } = await import('../dist/services/aiService.js');
  const { getATSFeedback } = await import('../dist/services/atsService.js');
  const { suggestAnswer } = await import('../dist/services/answerSuggestionService.js');
  const outputs = [
    { fullName:'Example Person', technicalSkills:['Python'] },
    { score:55,suggestions:['Describe your technical experience clearly.','Add specific evidence of your qualifications.','Use concise outcome-focused statements.'],scoring_breakdown:{keyword_alignment:20,experience_match:15,skill_coverage:10,achievement_quantification:5,format_compliance:5}},
    {answer:'My technical skills include Python.',needsInput:false}
  ];
  t.mock.method(globalThis,'fetch',async()=>{
    const output=outputs.shift();
    assert.ok(output);
    return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(output)}]},finishReason:'STOP'}]}),{status:200,headers:{'Content-Type':'application/json'}});
  });
  const resumeText='Education: University degree. Skills: Python and SQL. Experience: software engineering with projects and certifications.';
  assert.equal((await parseResumeWithAI(resumeText)).fullName,'Example Person');
  assert.equal((await getATSFeedback(resumeText,'Developer role with programming and software development skills')).score,55);
  const suggestion=await suggestAnswer(user,{question:'Tell us about your technical skills',factSources:['skills']});
  assert.equal(suggestion.requiresReview,true);
  assert.match(suggestion.answer,/Python/);
  assert.equal(outputs.length,0);
});
