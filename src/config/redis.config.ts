import { Redis as UpstashRedis } from '@upstash/redis';
import { Redis } from 'ioredis';
import { getEnv } from './env.config.js';
import { logger } from '../utils/logger.util.js';

export class RedisConnection {
  private static instance: RedisConnection | undefined;
  private httpClient?: UpstashRedis;
  private readonly tcpClients = new Map<string, Redis>();
  private constructor() {}

  static getInstance(): RedisConnection {
    return this.instance ??= new RedisConnection();
  }

  getClient(): UpstashRedis {
    if (!this.httpClient) {
      const url = getEnv.redis.url();
      const token = getEnv.redis.token();
      if (!url || !token) throw new Error('Upstash Redis HTTP is not configured');
      this.httpClient = new UpstashRedis({
        url, token,
        automaticDeserialization: false,
        retry: { retries: 1, backoff: () => 250 },
        signal: () => AbortSignal.timeout(5000)
      });
    }
    return this.httpClient;
  }

  private getTcpClient(name: string, blocking: boolean): Redis {
    const existing = this.tcpClients.get(name);
    if (existing) return existing;
    const url = getEnv.redis.tcpUrl();
    if (!url) throw new Error('UPSTASH_REDIS_TCP_URL is not configured');
    const client = new Redis(url, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: blocking ? null : 2,
      connectTimeout: 5000,
      retryStrategy: times => Math.min(times * 500, 5000)
      // rediss:// enables TLS with default certificate verification.
    });
    client.on('ready', () => logger.info({ event: 'redis.tcp.ready', connection: name }));
    client.on('error', error => logger.error({ event: 'redis.tcp.error', connection: name, error: error.name }));
    client.on('close', () => logger.debug({ event: 'redis.tcp.closed', connection: name }));
    this.tcpClients.set(name, client);
    return client;
  }

  getSubscriber(): Redis { return this.getTcpClient('subscriber', true); }
  getBlockingClient(workerName: string): Redis { return this.getTcpClient('worker:' + workerName, true); }
  getQueueClient(): Redis { return this.getTcpClient('queue-producer', false); }

  async connect(): Promise<void> {
    if (getEnv.redis.enabled()) {
      if (await this.getClient().ping() !== 'PONG') throw new Error('Unexpected Redis ping response');
      logger.info({ event: 'redis.http.ready' });
    }
    // TCP connections are opened only by actual consumers.
  }

  async healthCheck(): Promise<boolean> {
    if (!getEnv.redis.enabled()) return false;
    try { return (await this.getClient().ping()) === 'PONG'; }
    catch { return false; }
  }

  async disconnect(): Promise<void> {
    // disconnect() closes blocked clients immediately and cancels reconnection;
    // QUIT can sit behind a blocking command indefinitely.
    for (const client of this.tcpClients.values()) client.disconnect();
    this.tcpClients.clear();
    this.httpClient = undefined;
    logger.debug({ event: 'redis.closed' });
  }
}

export const redisConnection = RedisConnection.getInstance();
