import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import type { Express } from 'express';
import type MongoStore from 'connect-mongo';
import mongoose from 'mongoose';

import { createApp, createSessionStore } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';

const STARTUP_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;

type ShutdownReason = 'SIGINT' | 'SIGTERM' | 'startup-failure' | 'server-error' | 'uncaught-exception' | 'unhandled-rejection';

function log(level: 'info' | 'error', event: string, details: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...details });
  if (level === 'error') console.error(entry);
  else console.info(entry);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

export function createHttpServer(app: Express): Server {
  return createServer({
    headersTimeout: 15_000,
    requestTimeout: 60_000,
    keepAliveTimeout: 5_000,
    maxHeaderSize: 16 * 1024
  }, app);
}

export function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    // Stop accepting new connections and wait for active responses.
    server.close(error => {
      if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(env.PORT);
  });
}

function verifySessionStore(store: MongoStore): Promise<void> {
  // A read waits for the connection and TTL index initialization without creating a session.
  return new Promise((resolve, reject) => {
    store.get(randomUUID(), error => error ? reject(error) : resolve());
  });
}

export async function main(): Promise<void> {
  let server: Server | undefined;
  let store: MongoStore | undefined;
  let ready = false;
  let stopping = false;
  let exitCode = 0;
  let startup: Promise<void> | undefined;
  let shutdownTask: Promise<void> | undefined;

  function shutdown(reason: ShutdownReason, failed = false): Promise<void> {
    if (failed) exitCode = 1;
    if (shutdownTask) return shutdownTask;

    stopping = true;
    ready = false;
    log('info', 'shutdown.started', { reason });

    const deadline = setTimeout(() => {
      log('error', 'shutdown.timeout', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
      server?.closeAllConnections();
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    shutdownTask = (async () => {
      // A signal may arrive during database connection or HTTP bind.
      await startup?.catch(() => undefined);

      try {
        if (server) await closeHttpServer(server);
        log('info', 'shutdown.http.closed');
      } catch (error) {
        exitCode = 1;
        log('error', 'shutdown.http.failed', { error: errorName(error) });
        server?.closeAllConnections();
      }

      // Close both database connections only after HTTP requests finish.
      const results = await Promise.allSettled([
        store?.close() ?? Promise.resolve(),
        mongoose.disconnect()
      ]);
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
          exitCode = 1;
          log('error', 'shutdown.dependency.failed', {
            dependency: index === 0 ? 'oauth-session-store' : 'mongodb',
            error: errorName(result.reason)
          });
        }
      }

      clearTimeout(deadline);
      process.exitCode = exitCode;
      log('info', 'shutdown.completed', { exitCode });
    })();

    return shutdownTask;
  }

  // Register lifecycle handlers before opening any connections.
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('uncaughtException', error => {
    log('error', 'process.uncaughtException', { error: errorName(error) });
    void shutdown('uncaught-exception', true);
  });
  process.on('unhandledRejection', error => {
    log('error', 'process.unhandledRejection', { error: errorName(error) });
    void shutdown('unhandled-rejection', true);
  });

  const startupDeadline = setTimeout(() => {
    log('error', 'startup.timeout', { timeoutMs: STARTUP_TIMEOUT_MS });
    void shutdown('startup-failure', true);
  }, STARTUP_TIMEOUT_MS);
  startupDeadline.unref();

  startup = (async () => {
    log('info', 'startup.started', { environment: env.NODE_ENV, port: env.PORT });
    await connectDB();
    if (stopping) return;

    store = createSessionStore();
    store.on('error', (error: unknown) => {
      log('error', 'session-store.error', { error: errorName(error) });
    });
    await verifySessionStore(store);
    if (stopping) return;
    log('info', 'startup.session-store.ready');

    server = createHttpServer(createApp(store, {
      isDraining: () => stopping,
      isReady: () => ready && mongoose.connection.readyState === 1
    }));
    await listen(server);
    server.on('error', error => {
      log('error', 'http.server.error', { error: errorName(error) });
      void shutdown('server-error', true);
    });

    if (!stopping) {
      ready = true;
      log('info', 'startup.ready', { port: env.PORT });
    }
  })();

  try {
    await startup;
  } catch (error) {
    log('error', 'startup.failed', { error: errorName(error) });
    await shutdown('startup-failure', true);
  } finally {
    clearTimeout(startupDeadline);
  }
}

// Importing the module in tests must not start the server.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(error => {
    log('error', 'startup.fatal', { error: errorName(error) });
    process.exit(1);
  });
}
