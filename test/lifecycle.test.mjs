import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { test } from 'node:test';

const fixture = `
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import session from 'express-session';

mongoose.connect = async () => mongoose;
mongoose.disconnect = async () => console.log('fixture.database.closed');
const store = new session.MemoryStore();
store.close = async () => console.log('fixture.session.closed');
if (process.env.FAIL_SESSION === '1') {
  store.get = (_id, callback) => callback(new Error('test session failure'));
}
MongoStore.create = () => store;
const { main } = await import('./dist/server.js');
await main();
`;

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function runFixture({ failSession = false } = {}) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', fixture], {
    env: {
      ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'info', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', UPSTASH_REDIS_TCP_URL: '', PORT: String(await freePort()),
      MONGODB_URI: 'mongodb://127.0.0.1:27017/jobautofill',
      JWT_SECRET: 'test-only-secret-at-least-32-characters',
      GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test',
      GOOGLE_GEMINI_API_KEY: 'test', CLIENT_URL: 'http://localhost:3000',
      SERVER_URL: 'http://localhost:5000', FAIL_SESSION: failSession ? '1' : '0'
    }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  let signalSent = false;
  child.stdout.on('data', chunk => {
    output += chunk;
    if (!failSession && !signalSent && output.includes('"event":"startup.ready"')) {
      signalSent = true;
      child.kill('SIGTERM');
    }
  });
  child.stderr.on('data', chunk => { output += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    return { ...result, output };
  } finally { clearTimeout(timer); }
}

test('SIGTERM drains the process and closes both dependency connections', async () => {
  const result = await runFixture();
  assert.equal(result.code, 0, result.output);
  assert.equal(result.signal, null);
  assert.match(result.output, /"event":"startup.ready"/);
  assert.match(result.output, /"reason":"SIGTERM"/);
  assert.match(result.output, /fixture\.database\.closed/);
  assert.match(result.output, /fixture\.session\.closed/);
  assert.match(result.output, /"event":"shutdown.completed"/);
});

test('Session store startup failure never marks HTTP ready and cleans up', async () => {
  const result = await runFixture({ failSession: true });
  assert.equal(result.code, 1, result.output);
  assert.doesNotMatch(result.output, /"event":"startup.ready"/);
  assert.match(result.output, /"event":"startup.failed"/);
  assert.match(result.output, /fixture\.database\.closed/);
  assert.match(result.output, /fixture\.session\.closed/);
});
