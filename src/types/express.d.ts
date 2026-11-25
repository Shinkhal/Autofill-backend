import type { UserDocument } from '../models/User.js';

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: UserDocument;
    }
  }
}
export {};
