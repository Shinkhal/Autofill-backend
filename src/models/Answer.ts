import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  question: { type: String, required: true },
  questionKey: { type: String, required: true },
  answer: { type: String, required: true },
  category: { type: String, default: 'general' }
}, { timestamps: true });
schema.index({ userId: 1, questionKey: 1 }, { unique: true });
schema.index({ userId: 1, updatedAt: -1 });
export const Answer = mongoose.model('Answer', schema);
