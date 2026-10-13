import { Router } from 'express';
import { sendError } from '../errors';
import { ROBOT_MODEL } from '../fixtures/robotModel';

export const robotsRouter = Router();

robotsRouter.get('/robots/:id/model', (req, res) => {
  if (req.params.id !== ROBOT_MODEL.deviceId) {
    return sendError(res, 422, 'VALIDATION_FAILED', `알 수 없는 로봇 ID: ${req.params.id}`);
  }
  res.json(ROBOT_MODEL);
});
