import express from "express";
import {
  getAllJobs,
  createJob,
  getJobById,
  updateJob,
  deleteJob,
} from "../controllers/jobController.js";
import {protect} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getAllJobs);
router.post("/", protect, createJob);
router.get("/:id", protect, getJobById);
router.put("/:id", protect, updateJob);
router.delete("/:id", protect, deleteJob);

export default router;
