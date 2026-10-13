import { Router } from 'express';
import type { AlarmListResponse } from '@ecocycle/shared';
import { sendError } from '../errors';
import { alarms } from '../sim/state';

export const alarmsRouter = Router();

const STATES = ['active', 'acknowledged', 'cleared'];

// GET /alarms?state=active&from=...  (state, from 모두 선택. 최신순)
alarmsRouter.get('/alarms', (req, res) => {
  const { state, from } = req.query;
  if (state !== undefined && (typeof state !== 'string' || !STATES.includes(state))) {
    return sendError(res, 422, 'VALIDATION_FAILED', `state는 ${STATES.join(', ')} 중 하나여야 합니다.`);
  }
  let fromMs = -Infinity;
  if (from !== undefined) {
    fromMs = typeof from === 'string' ? Date.parse(from) : NaN;
    if (Number.isNaN(fromMs)) {
      return sendError(res, 422, 'VALIDATION_FAILED', 'from은 ISO 8601 시각이어야 합니다.');
    }
  }
  const body: AlarmListResponse = alarms
    .filter((a) => (state === undefined || a.state === state) && Date.parse(a.ts) >= fromMs)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  res.json(body);
});
