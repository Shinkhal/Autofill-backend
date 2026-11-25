import { JobApplication } from "../models/JobApplication.js";

export const getAllJobs = async (req, res) => {
  try {
    const jobs = await JobApplication.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

export const createJob = async (req, res) => {
  try {
    const newJob = await JobApplication.create({ ...req.body, userId: req.user.id });
    res.status(201).json(newJob);
  } catch (err) {
    res.status(400).json({ message: "Failed to create job", error: err.message });
  }
};

export const getJobById = async (req, res) => {
  try {
    const job = await JobApplication.findOne({ _id: req.params.id, userId: req.user.id });
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.status(200).json(job);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

export const updateJob = async (req, res) => {
  try {
    const job = await JobApplication.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true }
    );
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.status(200).json(job);
  } catch (err) {
    res.status(400).json({ message: "Update failed", error: err.message });
  }
};

export const deleteJob = async (req, res) => {
  try {
    const job = await JobApplication.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.status(200).json({ message: "Job deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};
