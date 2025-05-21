import express from 'express';
import { getprofile, updateProfile } from '../controllers/userController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/:id',protect, getprofile);
router.put('/:id',protect, updateProfile);

export default router;