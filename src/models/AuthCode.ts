import mongoose from 'mongoose';
const authCodeSchema = new mongoose.Schema({
  hash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true }
});
authCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AuthCode = mongoose.model('AuthCode', authCodeSchema);
