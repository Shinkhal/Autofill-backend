import express from 'express';
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

export function createSessionStore() {
  return MongoStore.create({ mongoUrl: env.MONGODB_URI, dbName: 'jobautofill', ttl: 600 });
}

export function createApp(store: session.Store) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: new URL(env.CLIENT_URL).origin, credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  configurePassport();
  app.get('/', (_req, res) => { res.send('API is running...'); });
  app.get('/health', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
  });
  app.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many requests' } }), session({
    name: 'autofill.oauth', secret: env.SESSION_SECRET ?? env.JWT_SECRET, store,
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600000 }
  }), passport.initialize(), authRoutes);
  app.use('/api/resume', rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many resume requests' } }), resumeRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/listjobs', rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }), jobListingRoutes);
  app.use('/api/ats', rateLimit({ windowMs: 900000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false }), atsRoutes);
  app.use((_req, res) => { res.status(404).json({ message: 'Route not found' }); });
  app.use(errorHandler);
  return app;
}
