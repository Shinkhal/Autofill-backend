import session from 'express-session';
import MongoStore from 'connect-mongo';
import { getEnv } from './env.config.js';

const SESSION_TTL_SECONDS = 600;

export function createSessionStore(): MongoStore {
  return MongoStore.create({
    mongoUrl: getEnv.database.uri(),
    dbName: getEnv.database.name(),
    ttl: SESSION_TTL_SECONDS,
    autoRemove: 'native',
    mongoOptions: {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      maxPoolSize: 10
    }
  });
}

export function createSessionMiddleware(store: session.Store) {
  return session({
    name: 'autofill.oauth',
    secret: getEnv.session.secret(),
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: getEnv.app.isProd(),
      sameSite: 'lax',
      maxAge: SESSION_TTL_SECONDS * 1000
    }
  });
}
