import { Router } from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { rateLimit } from 'express-rate-limit';
import { suggestFields, suggestApplicationAnswer } from '../controllers/autofillController.js';
const router = Router();
router.post('/map', protect, suggestFields);
router.post('/suggest', protect, rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many answer requests' } }), suggestApplicationAnswer);
export default router;
