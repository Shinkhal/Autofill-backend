import mongoose from 'mongoose';
const resumeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  slot: { type: Number, required: true, min: 0, max: 19, select: false },
  label: { type: String, required: true, maxlength: 150 },
  originalName: { type: String, required: true, maxlength: 200 },
  mimeType: { type: String, enum: ['application/pdf'], required: true },
  size: { type: Number, min: 1, max: 5 * 1024 * 1024, required: true },
  content: { type: Buffer, required: true, select: false },
  parsedProfile: { type: mongoose.Schema.Types.Mixed, select: false },
  parsedAt: Date
}, { timestamps: true });
resumeSchema.index({ userId: 1, createdAt: -1 });
resumeSchema.index({ userId: 1, slot: 1 }, { unique: true });
export const Resume = mongoose.model('Resume', resumeSchema);
