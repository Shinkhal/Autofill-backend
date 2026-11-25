import { Router } from 'express';
import { getProfile, updateProfile } from '../controllers/userController.js';
import { protect, requireOwner } from '../middlewares/authMiddleware.js';
const router = Router();
router.get('/:id', protect, requireOwner, getProfile);
router.put('/:id', protect, requireOwner, updateProfile);
export default router;
