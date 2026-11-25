import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';

const env = {
  NODE_ENV: 'test', PORT: '5000',
  MONGODB_URI: 'mongodb://localhost:27017/jobautofill',
  JWT_SECRET: 'test-only-secret-at-least-32-characters',
  GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test',
  GOOGLE_GEMINI_API_KEY: 'test', CLIENT_URL: 'http://localhost:3000',
  SERVER_URL: 'http://localhost:5000',
  UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', UPSTASH_REDIS_TCP_URL: ''
};
Object.assign(process.env, env);
const { getEnv } = await import('../dist/config/env.config.js');
const { DatabaseConfig } = await import('../dist/config/database.config.js');
const { RedisConnection } = await import('../dist/config/redis.config.js');

test('Grouped env accessors and safe summary omit credentials', () => {
  getEnv.validate();
  assert.equal(getEnv.app.port(), 5000);
  assert.equal(getEnv.database.uri(), env.MONGODB_URI);
  assert.equal(getEnv.redis.enabled(), false);
  const summary = JSON.stringify(getEnv.summary());
  assert.ok(!summary.includes(env.JWT_SECRET));
  assert.ok(!summary.includes(env.MONGODB_URI));
});

test('Invalid Redis credential pair and insecure production TCP URL fail validation', () => {
  for (const overrides of [
    { UPSTASH_REDIS_REST_URL: 'https://example.test' },
    { NODE_ENV:'production', UPSTASH_REDIS_TCP_URL:'redis://localhost:6379' }
  ]) {
    const result = spawnSync(process.execPath, ['--input-type=module','-e',
      "import {getEnv} from './dist/config/env.config.js'; getEnv.validate();"], {
      env:{ ...process.env, ...env, ...overrides }, encoding:'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid environment configuration: UPSTASH_REDIS_/);
  }
});

test('Database singleton coalesces concurrent connections and retries failure', async t => {
  let calls = 0;
  t.mock.method(mongoose, 'connect', async () => {
    if (++calls === 1) throw new Error('simulated transient failure');
    return mongoose;
  });
  assert.equal(DatabaseConfig.getInstance(), mongoose);
  await Promise.all([DatabaseConfig.connect(2, 0), DatabaseConfig.connect(2, 0)]);
  assert.equal(calls, 2);
  assert.equal(DatabaseConfig.getConnectionStatus(), false);
  assert.equal(await DatabaseConfig.healthCheck(), false);
});

test('Redis is optional and singleton does not connect if disabled', async () => {
  const redis = RedisConnection.getInstance();
  assert.equal(redis, RedisConnection.getInstance());
  await redis.connect();
  assert.equal(await redis.healthCheck(), false);
  assert.throws(() => redis.getClient(), /not configured/);
  await redis.disconnect();
});

test('Redis HTTP client and named TCP clients are isolated and lazy', async t => {
  t.mock.method(getEnv.redis, 'url', () => 'https://example.test');
  t.mock.method(getEnv.redis, 'token', () => 'test-token');
  t.mock.method(getEnv.redis, 'enabled', () => true);
  t.mock.method(getEnv.redis, 'tcpUrl', () => 'rediss://localhost:6379');
  const redis = RedisConnection.getInstance();
  try {
    const http = redis.getClient();
    assert.equal(http, redis.getClient());
    t.mock.method(globalThis, 'fetch', async url => new Response(JSON.stringify(String(url).includes('/pipeline') ? [{ result: 'PONG' }] : { result: 'PONG' }), { headers: { 'content-type': 'application/json' } }));
    await redis.connect();
    assert.equal(await redis.healthCheck(), true);
    const first = redis.getBlockingClient('first');
    const second = redis.getBlockingClient('second');
    const producer = redis.getQueueClient();
    assert.equal(first, redis.getBlockingClient('first'));
    assert.notEqual(first, second);
    assert.notEqual(first, producer);
    assert.equal(first.status, 'wait');
    assert.equal(second.status, 'wait');
    assert.equal(producer.status, 'wait');
    assert.equal(first.options.maxRetriesPerRequest, null);
    assert.equal(producer.options.maxRetriesPerRequest, 2);
  } finally {
    await redis.disconnect();
  }
});
