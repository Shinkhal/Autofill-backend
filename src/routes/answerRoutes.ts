import { Router } from 'express';
import { z } from 'zod';
import { Answer } from '../models/Answer.js';
import { answerSchema, questionKey, pageQuery } from '../schemas/answer.js';
import { objectId } from '../schemas/job.js';
import { protect } from '../middlewares/authMiddleware.js';
import { HttpError } from '../utils/http-error.js';

const router = Router();
router.use(protect);
router.get('/', async (req, res) => {
  const { page, limit, category } = pageQuery.extend({category: z.string().max(80).optional()}).parse(req.query);
  const filter = { userId: req.authenticatedUser!._id, ...(category ? {category} : {}) };
  const [answers, total] = await Promise.all([Answer.find(filter).sort({updatedAt:-1,_id:-1}).skip((page-1)*limit).limit(limit).lean(), Answer.countDocuments(filter)]);
  res.json({ answers, total, page, limit });
});
router.post('/', async (req, res) => {
  const input = answerSchema.parse(req.body);
  const key = questionKey(input.question);
  if (!key) throw new HttpError(400, 'Invalid question');
  try {
    const answer = await Answer.create({...input, questionKey:key, userId:req.authenticatedUser!._id});
    res.status(201).json(answer);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new HttpError(409, 'Question already exists');
    throw error;
  }
});
router.get('/match', async (req,res) => {
  const q = z.string().trim().min(1).max(500).parse(req.query.question);
  const answer = await Answer.findOne({userId:req.authenticatedUser!._id, questionKey:questionKey(q)}).lean();
  res.json({answer, requiresReview:true});
});
router.put('/:id', async (req,res) => {
  const input = answerSchema.parse(req.body);
  const key = questionKey(input.question);
  if (!key) throw new HttpError(400, 'Invalid question');
  try {
    const answer = await Answer.findOneAndUpdate({_id:objectId.parse(req.params.id),userId:req.authenticatedUser!._id},{$set:{...input,questionKey:key}},{new:true,runValidators:true});
    if (!answer) throw new HttpError(404,'Answer not found');
    res.json(answer);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new HttpError(409, 'Question already exists');
    throw error;
  }
});
router.delete('/:id', async (req,res) => {
  if (!await Answer.findOneAndDelete({_id:objectId.parse(req.params.id),userId:req.authenticatedUser!._id})) throw new HttpError(404,'Answer not found');
  res.sendStatus(204);
});
export default router;
