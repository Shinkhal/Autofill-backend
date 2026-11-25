import { Router } from 'express';
import multer from 'multer';
import { protect } from '../middlewares/authMiddleware.js';
import { handleResumeUpload } from '../controllers/resumeController.js';
import { HttpError } from '../utils/http-error.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter: (_req, file, done) => {
    if (file.mimetype !== 'application/pdf') return done(new HttpError(415, 'Only PDF files are supported'));
    done(null, true);
  }
});
router.post('/upload', protect, upload.single('resume'), handleResumeUpload);
export default router;
