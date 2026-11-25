import express from 'express';
import {
  getAllJobListings,
  getJobById,
  getJobSalaries
} from '../controllers/jobListingController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get all job listings with filters
router.get('/', protect, getAllJobListings);

// Get job salary estimates (should come before /:source/:id to avoid conflicts)
router.get('/salaries', protect, getJobSalaries);

// Get specific job by ID and source
router.get('/:source/:id', protect, getJobById);

export default router;