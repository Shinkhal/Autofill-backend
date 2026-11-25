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
      enum: ["Saved", "Applied", "Interview", "Rejected", "Offer", "Accepted", "Withdrawn"],
      default: "Applied",
    },
    jobLink: String,
    notes: String,
    location: String,
    source: String,
    followUpDate: Date,
    statusHistory: [{ status: String, changedAt: Date, _id: false }],
    dateApplied: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

JobApplicationSchema.index({ userId: 1, createdAt: -1 });

JobApplicationSchema.index({ userId: 1, status: 1, createdAt: -1 });
JobApplicationSchema.index({ userId: 1, followUpDate: 1 });

export const JobApplication = mongoose.model("JobApplication", JobApplicationSchema);
