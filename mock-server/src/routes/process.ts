import { Router } from 'express';
import type { PlantHistoryResponse, PlantMetric, ProcessState } from '@ecocycle/shared';
import { PLANT_METRICS } from '@ecocycle/shared';
import { sendError } from '../errors';
import { buildPlantHistory, MAX_HISTORY_POINTS, parseInterval } from '../sim/history';
import { processState } from '../sim/process';
import { summarize } from '../sim/state';

export const processRouter = Router();

// GET /process/state — 공정 흐름 현재 상태와 최근 목록
processRouter.get('/process/state', (_req, res) => {
  const body: ProcessState = processState();
  res.json(body);
});

const isPlantMetric = (value: unknown): value is PlantMetric =>
  typeof value === 'string' && (PLANT_METRICS as readonly string[]).includes(value);

// GET /plant/history?metric=balesToday&from=...&to=...&interval=10m
processRouter.get('/plant/history', (req, res) => {
  const { metric, from, to, interval } = req.query;
  if (typeof from !== 'string' || typeof to !== 'string' || typeof interval !== 'string') {
    return sendError(res, 422, 'VALIDATION_FAILED', 'metric, from, to, interval이 필요합니다.');
  }
  if (!isPlantMetric(metric)) {
    return sendError(res, 422, 'VALIDATION_FAILED', `지원하는 metric: ${PLANT_METRICS.join(', ')}`);
  }
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const intervalMs = parseInterval(interval);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs >= toMs) {
    return sendError(res, 422, 'VALIDATION_FAILED', 'from, to는 from < to인 ISO 8601 시각이어야 합니다.');
  }
  if (!intervalMs) {
    return sendError(res, 422, 'VALIDATION_FAILED', 'interval은 10m, 1h, 1d 같은 형식이어야 합니다.');
  }
  if ((toMs - fromMs) / intervalMs > MAX_HISTORY_POINTS) {
    return sendError(res, 422, 'VALIDATION_FAILED', `점이 ${MAX_HISTORY_POINTS}개를 넘지 않게 interval을 키우세요.`);
  }
  const body: PlantHistoryResponse = {
    metric,
    interval,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    points: buildPlantHistory(metric, summarize()[metric], fromMs, toMs, intervalMs),
  };
  res.json(body);
});
