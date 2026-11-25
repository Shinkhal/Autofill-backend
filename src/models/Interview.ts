import mongoose from "mongoose";

const interviewProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  sessionId: { type: String, required: true, unique: true },
  jobDescription: { type: String, required: true },

  questions: [
    {
      question: String,
      answer: String,
      feedback: String,
      score: Number
    }
  ],

  overallScore: { type: Number, default: 0 },
  strengths: [String],
  improvements: [String],
  status: { type: String, enum: ["in-progress", "completed"], default: "in-progress" }

}, { timestamps: true });

export default mongoose.model("InterviewProgress", interviewProgressSchema);
