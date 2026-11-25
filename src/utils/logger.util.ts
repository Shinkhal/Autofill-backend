import pino from 'pino';
import { getEnv } from '../config/env.config.js';

// Do not include request bodies, raw URLs or credentials in log metadata.
export const logger = pino({
  level: getEnv.logging.level(),
  base: { service: 'autofill-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['authorization', 'cookie', 'password', 'token', 'secret', 'apiKey', 'req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]'
  }
});
