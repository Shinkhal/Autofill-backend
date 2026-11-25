import mongoose from 'mongoose';

const authSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  refreshHash: { type: String, required: true, select: false },
  usedHashes: { type: [String], default: [], select: false },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  lastUsedAt: { type: Date, required: true },
  deviceName: { type: String, maxlength: 150 },
  client: { type: String, enum: ['web', 'extension'], required: true }
}, { timestamps: true });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
export const AuthSession = mongoose.model('AuthSession', authSessionSchema);
