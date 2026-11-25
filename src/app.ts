import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import express, { type Express, type RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import passport from 'passport';
import type session from 'express-session';
import { createSessionMiddleware } from './config/session.config.js';
import { DatabaseConfig } from './config/database.config.js';
import { logger } from './utils/logger.util.js';

import { getEnv } from './config/env.config.js';
import { configurePassport } from './config/passport.config.js';
import authRoutes from './routes/authRoutes.js';
import resumeRoutes from './routes/resumeRoutes.js';
import userRoutes from './routes/userRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import jobListingRoutes from './routes/jobListing.js';
import atsRoutes from './routes/atsRoutes.js';
import answerRoutes from './routes/answerRoutes.js';
import autofillRoutes from './routes/autofillRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const MINUTE_MS = 60_000;

interface AppOptions {
  isDraining?: () => boolean;
  isReady?: () => boolean;
}

function limiter(windowMs: number, limit: number, message = 'Too many requests'): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message }
  });
}

const requestTelemetry: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const started = performance.now();
  res.setHeader('X-Request-ID', requestId);

  // Do not log request URLs, headers, bodies, tokens or resume data.
  if (getEnv.app.env() !== 'test') {
    res.once('close', () => {
      logger.info({
        event: 'http.request',
        requestId,
        method: req.method,
        status: res.writableFinished ? res.statusCode : undefined,
        aborted: !res.writableFinished,
        durationMs: Math.round(performance.now() - started)
      });
    });
  }
  next();
};

export function createApp(store: session.Store, options: AppOptions = {}): Express {
  const app = express();
  const isDraining = options.isDraining ?? (() => false);
  const isReady = options.isReady ?? (() => DatabaseConfig.getConnectionStatus());

  // Application and security middleware
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', getEnv.app.trustProxy());

  app.use(requestTelemetry);
  app.use(helmet({
    strictTransportSecurity: getEnv.app.env() === 'production' ? undefined : false
  }));
  app.use(cors({
    origin: [new URL(getEnv.client.url()).origin, ...getEnv.client.extensionOrigins()],
    credentials: true,
    exposedHeaders: ['X-Request-ID', 'RateLimit', 'RateLimit-Policy']
  }));

  // Health probes bypass rate limiting and remain available while draining.
  app.get('/', (_req, res) => {
    res.send('API is running...');
  });

  app.get('/health/live', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });

  app.get(['/health', '/health/ready'], (_req, res) => {
    const ready = !isDraining() && isReady();
    res.set('Cache-Control', 'no-store')
      .status(ready ? 200 : 503)
      .json({ status: ready ? 'ok' : 'unavailable' });
  });

  // Reject new application requests during shutdown while in-flight work drains.
  app.use((_req, res, next) => {
    if (!isDraining()) return next();
    res.set('Connection', 'close')
      .set('Retry-After', '5')
      .status(503)
      .json({ message: 'Service is shutting down' });
  });

  // Sensitive API responses must not be cached.
  app.use(['/auth', '/api'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Apply API rate limits before parsing request bodies.
  app.use('/api', limiter(MINUTE_MS, 300));
  app.use('/api/resume', limiter(15 * MINUTE_MS, 15, 'Too many resume requests'));
  app.use('/api/listjobs', limiter(MINUTE_MS, 30));
  app.use('/api/ats', limiter(15 * MINUTE_MS, 15));
  app.use('/auth', limiter(15 * MINUTE_MS, 100));

  app.use(express.json({ limit: '256kb' }));

  // OAuth state is stored server-side; JWT-protected API routes do not need sessions.
  configurePassport();
  app.use('/auth', createSessionMiddleware(store), passport.initialize(), authRoutes);

  // API routes
  app.use('/api/resume', resumeRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/listjobs', jobListingRoutes);
  app.use('/api/ats', atsRoutes);
  app.use('/api/autofill', autofillRoutes);
  app.use('/api/answers', answerRoutes);

  // Always register the fallback and error handler last.
  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });
  app.use(errorHandler);

  return app;
}
