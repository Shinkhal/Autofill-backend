import mongoose from "mongoose";

const JobApplicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    company: { type: String, required: true },
    role: { type: String, required: true },
    status: {
      type: String,
      enum: ["Applied", "Interview", "Rejected", "Offer"],
      default: "Applied",
    },
    jobLink: String,
    notes: String,
    dateApplied: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const JobApplication = mongoose.model("JobApplication", JobApplicationSchema);
