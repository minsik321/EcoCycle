import { Router } from 'express';
import type { AlarmListResponse } from '@ecocycle/shared';
import { DEVICE_SEARCH_NAMES, matchesSearch, RECORD_SEARCH_MAX_LENGTH } from '@ecocycle/shared';
import { sendError } from '../errors';
import { parseSearch } from './records';
import { alarms } from '../sim/state';

export const alarmsRouter = Router();

const STATES = ['active', 'acknowledged', 'cleared'];

// GET /alarms?state=active&from=...&to=...&q=...  (모두 선택. 기간 [from, to)와 검색어 q를 함께 적용, 최신순)
alarmsRouter.get('/alarms', (req, res) => {
  const { state, from, to } = req.query;
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
  let toMs = Infinity;
  if (to !== undefined) {
    toMs = typeof to === 'string' ? Date.parse(to) : NaN;
    if (Number.isNaN(toMs)) {
      return sendError(res, 422, 'VALIDATION_FAILED', 'to는 ISO 8601 시각이어야 합니다.');
    }
  }
  const q = parseSearch(req.query.q);
  if (q === null) return sendError(res, 422, 'VALIDATION_FAILED', `q는 ${RECORD_SEARCH_MAX_LENGTH}자 이하의 글이어야 합니다.`);
  const body: AlarmListResponse = alarms
    .filter((a) => (state === undefined || a.state === state) && Date.parse(a.ts) >= fromMs && Date.parse(a.ts) < toMs)
    .filter((a) => matchesSearch(q, [DEVICE_SEARCH_NAMES[a.deviceId], a.deviceId, a.message]))
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  res.json(body);
});
