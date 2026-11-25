import { logger } from '../utils/logger.util.js';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import mongoose from 'mongoose';
import { HttpError } from '../utils/http-error.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof ZodError || error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ message: 'Invalid request data' }); return;
  }
  if (error instanceof MulterError) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'Invalid resume upload' }); return;
  }
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({ message: 'Invalid JSON body' }); return;
  }
  if (error instanceof Error && 'status' in error && error.status === 413) {
    res.status(413).json({ message: 'Request body too large' }); return;
  }
  logger.error({ event: 'http.request.failed', error: error instanceof Error ? error.name : 'UnknownError', requestId: res.getHeader('X-Request-ID') });
  res.status(500).json({ message: 'Internal server error' });
};
