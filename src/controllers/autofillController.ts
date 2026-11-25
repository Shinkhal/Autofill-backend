import type { RequestHandler } from 'express';
import { suggestAnswer } from '../services/answerSuggestionService.js';
import { autofillSchema, answerSuggestionSchema } from '../schemas/autofill.js';
import { mapFields } from '../services/autofillService.js';

export const suggestFields: RequestHandler = (req, res) => {
  res.json(mapFields(req.authenticatedUser!, autofillSchema.parse(req.body).fields));
};

export const suggestApplicationAnswer: RequestHandler = async (req, res) => {
  res.json(await suggestAnswer(req.authenticatedUser!, answerSuggestionSchema.parse(req.body)));
};
