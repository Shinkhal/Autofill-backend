import { Router } from 'express';
import multer from 'multer';
import { analyzeResume } from '../controllers/atsController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { HttpError } from '../utils/http-error.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 120000, parts: 3 },
  fileFilter: (_req, file, done) => {
    if (file.mimetype !== 'application/pdf') return done(new HttpError(415, 'Only PDF files are supported'));
    done(null, true);
  }
});
router.post('/analyze', protect, upload.single('resume'), analyzeResume);
export default router;
