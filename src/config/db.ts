import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, { dbName: 'jobautofill', serverSelectionTimeoutMS: 10000 });
  console.info('MongoDB connected');
}
