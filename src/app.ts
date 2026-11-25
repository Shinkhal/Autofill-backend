import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import express, { type Express, type RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import passport from 'passport';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';

import { env } from './config/env.js';
import { configurePassport } from './config/passport.js';
import authRoutes from './routes/authRoutes.js';
import resumeRoutes from './routes/resumeRoutes.js';
import userRoutes from './routes/userRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import jobListingRoutes from './routes/jobListing.js';
import atsRoutes from './routes/atsRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const MINUTE_MS = 60_000;
const SESSION_TTL_SECONDS = 600;

interface AppOptions {
  isDraining?: () => boolean;
  isReady?: () => boolean;
}

export function createSessionStore(): MongoStore {
  return MongoStore.create({
    mongoUrl: env.MONGODB_URI,
    dbName: 'jobautofill',
    ttl: SESSION_TTL_SECONDS,
    autoRemove: 'native',
    mongoOptions: {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      maxPoolSize: 10
    }
  });
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
  if (env.NODE_ENV !== 'test') {
    res.once('close', () => {
      console.info(JSON.stringify({
        level: 'info',
        event: 'http.request',
        requestId,
        method: req.method,
        status: res.writableFinished ? res.statusCode : undefined,
        aborted: !res.writableFinished,
        durationMs: Math.round(performance.now() - started)
      }));
    });
  }
  next();
};

export function createApp(store: session.Store, options: AppOptions = {}): Express {
  const app = express();
  const isDraining = options.isDraining ?? (() => false);
  const isReady = options.isReady ?? (() => mongoose.connection.readyState === 1);

  // Application and security middleware
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestTelemetry);
  app.use(helmet({
    strictTransportSecurity: env.NODE_ENV === 'production' ? undefined : false
  }));
  app.use(cors({
    origin: new URL(env.CLIENT_URL).origin,
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
  app.use('/auth', session({
    name: 'autofill.oauth',
    secret: env.SESSION_SECRET ?? env.JWT_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_TTL_SECONDS * 1000
    }
  }), passport.initialize(), authRoutes);

  // API routes
  app.use('/api/resume', resumeRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/listjobs', jobListingRoutes);
  app.use('/api/ats', atsRoutes);

  // Always register the fallback and error handler last.
  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });
  app.use(errorHandler);

  return app;
}
