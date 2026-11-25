import mongoose from 'mongoose';
import { createApp, createSessionStore } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';

async function main(): Promise<void> {
  await connectDB();
  const store = createSessionStore();
  store.on('error', () => console.error('OAuth session store error'));
  const server = createApp(store).listen(env.PORT, () => console.info('API listening on port', env.PORT));
  let stopping = false;
  function shutdown(): void {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(() => {
      void Promise.all([mongoose.disconnect(), store.close()]).then(() => { clearTimeout(timeout); process.exit(0); }).catch(() => process.exit(1));
    });
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  server.on('error', () => { console.error('HTTP server failed'); void Promise.allSettled([mongoose.disconnect(), store.close()]).finally(() => process.exit(1)); });
}
main().catch(error => { console.error('Startup failed:', error instanceof Error ? error.name : 'UnknownError'); process.exit(1); });
