import mongoose from 'mongoose';
import { setTimeout as delay } from 'node:timers/promises';
import { getEnv } from './env.config.js';
import { logger } from '../utils/logger.util.js';

export class DatabaseConfig {
  private static connectionTask: Promise<void> | undefined;
  private static listenersAttached = false;
  private constructor() {}

  static getInstance(): typeof mongoose {
    if (!this.listenersAttached) {
      mongoose.connection.on('connected', () => logger.info({ event: 'mongodb.connected' }));
      mongoose.connection.on('disconnected', () => logger.warn({ event: 'mongodb.disconnected' }));
      mongoose.connection.on('error', error => logger.error({ event: 'mongodb.error', error: error.name }));
      this.listenersAttached = true;
    }
    return mongoose;
  }

  static getConnectionStatus(): boolean {
    return mongoose.connection.readyState === 1;
  }

  static async connect(retries = 3, delayMs = 1000): Promise<void> {
    if (!Number.isInteger(retries) || retries < 1 || !Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error('Invalid database retry configuration');
    }
    if (this.getConnectionStatus()) return;
    if (this.connectionTask) return this.connectionTask;
    const client = this.getInstance();
    this.connectionTask = (async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await client.connect(getEnv.database.uri(), {
            dbName: getEnv.database.name(),
            minPoolSize: 0,
            maxPoolSize: 20,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
            maxIdleTimeMS: 30000
          });
          return;
        } catch (error) {
          logger.error({ event: 'mongodb.connect.failed', attempt, error: error instanceof Error ? error.name : 'UnknownError' });
          if (attempt === retries) throw error;
          await delay(delayMs);
        }
      }
    })();
    try { await this.connectionTask; } finally { this.connectionTask = undefined; }
  }

  static async healthCheck(): Promise<boolean> {
    if (!this.getConnectionStatus() || !mongoose.connection.db) return false;
    try {
      await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
      return true;
    } catch { return false; }
  }

  static async disconnect(): Promise<void> {
    // Also clean up partially opened connections after startup failure.
    await mongoose.disconnect();
    logger.info({ event: 'mongodb.closed' });
  }
}

export default DatabaseConfig;
