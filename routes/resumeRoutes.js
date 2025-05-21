// routes/resumeRoutes.js
import express from "express";
import multer from "multer";
import { handleResumeUpload } from "../controllers/resumeController.js";
import { protect } from "../middlewares/authMiddleware.js";


const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", protect, upload.single("resume"), handleResumeUpload);

export default router;
