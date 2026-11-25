import { Router } from 'express';
import multer from 'multer';
import { protect } from '../middlewares/authMiddleware.js';
import { handleResumeUpload, createResume, listResumes, getResume, renameResume, deleteResume, downloadResume, parseResume, applyResume } from '../controllers/resumeController.js';
import { HttpError } from '../utils/http-error.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 1024, parts: 3 },
  fileFilter: (_req, file, done) => {
    if (file.mimetype !== 'application/pdf') return done(new HttpError(415, 'Only PDF files are supported'));
    done(null, true);
  }
});
router.use(protect);
router.post('/upload', upload.single('resume'), handleResumeUpload);
router.post('/', upload.single('resume'), createResume);
router.get('/', listResumes);
router.get('/:id/download', downloadResume);
router.post('/:id/parse', parseResume);
router.post('/:id/apply', applyResume);
router.get('/:id', getResume);
router.patch('/:id', renameResume);
router.delete('/:id', deleteResume);
export default router;
