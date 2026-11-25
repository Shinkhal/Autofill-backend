import express from "express";
import multer from "multer";
import { analyzeResume } from "../controllers/atsController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf'];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/analyze', protect, upload.single('resume'), analyzeResume);

export default router;
