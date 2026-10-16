import { Router } from 'express';
import type { BatchRecord, PlantHistoryResponse, PlantMetric, ProcessState, VehicleRecord } from '@ecocycle/shared';
import { PLANT_METRICS } from '@ecocycle/shared';
import { sendError } from '../errors';
import { buildPlantHistory, MAX_HISTORY_POINTS, parseInterval } from '../sim/history';
import { baleRecords, batchControlState, batchEvents, baleDetail, liveBatchRecords, liveVehicleRecords, processState } from '../sim/process';
import { finishedBatchRecords, finishedVehicleRecords } from '../sim/records';
import { summarize } from '../sim/state';
import { sendRecordPage } from './records';
import { buildKpiHistory } from '../sim/kpi';

export const processRouter = Router();

// GET /process/state — 공정 흐름 현재 상태와 최근 목록
processRouter.get('/process/state', (_req, res) => {
  const body: ProcessState = processState();
  res.json(body);
});

/** 끝난 기록(sim/records)과 지금 진행 중인 것(sim/process)을 합친 공정 기록 전체 */
const allVehicles = (): VehicleRecord[] => [...finishedVehicleRecords(), ...liveVehicleRecords()];
const allBatches = (): BatchRecord[] => [...finishedBatchRecords(), ...liveBatchRecords()];

// GET /vehicles/records?from=...&to=...&page=1&pageSize=10 — 차량 기록 (입차 시각 기준)
processRouter.get('/vehicles/records', (req, res) => {
  sendRecordPage(req, res, allVehicles(), (r) => r.arrivedAt);
});

// GET /vehicles/{id} — 차량 기록 한 건
processRouter.get('/vehicles/:id', (req, res) => {
  const record = allVehicles().find((r) => r.id === req.params.id);
  if (!record) return sendError(res, 404, 'NOT_FOUND', `찾을 수 없는 차량: ${req.params.id}`);
  res.json(record);
});

// GET /batches/records?from=...&to=...&page=1&pageSize=10 — 배치 기록 (시작 시각 기준)
processRouter.get('/batches/records', (req, res) => {
  sendRecordPage(req, res, allBatches(), (r) => r.startedAt);
});

processRouter.get('/batches/control', (_req, res) => res.json(batchControlState()));
processRouter.get('/batches/events/records', (req, res) => sendRecordPage(req, res, batchEvents(), r => r.at));
// GET /bales/records?from=...&to=...&page=1&pageSize=10 — 베일 기록 (생산 시각 기준). /bales/:id보다 먼저 둔다
processRouter.get('/bales/records', (req, res) => sendRecordPage(req, res, baleRecords(), (r) => r.createdAt));
processRouter.get('/bales/:id', (req, res) => {
  const bale = baleDetail(req.params.id);
  if (!bale) return sendError(res, 404, 'NOT_FOUND', '베일을 찾을 수 없습니다.');
  res.json(bale);
});

// GET /batches/{id} — 배치 기록 한 건
processRouter.get('/batches/:id', (req, res) => {
  const record = allBatches().find((r) => r.id === req.params.id);
  if (!record) return sendError(res, 404, 'NOT_FOUND', `찾을 수 없는 배치: ${req.params.id}`);
  res.json(record);
});

const isPlantMetric =(value: unknown): value is PlantMetric =>
  typeof value === 'string' && (PLANT_METRICS as readonly string[]).includes(value);

processRouter.get('/plant/kpi-history', (req, res) => {
  const { metric, range, timeZone = 'Asia/Seoul' } = req.query;
  if (!isPlantMetric(metric) || (range !== 'today' && range !== '7d' && range !== '30d') || typeof timeZone !== 'string') {
    return sendError(res, 422, 'VALIDATION_FAILED', 'metric, range, timeZone을 확인하세요.');
  }
  try { new Intl.DateTimeFormat('ko-KR', { timeZone }); }
  catch { return sendError(res, 422, 'VALIDATION_FAILED', '올바른 IANA timeZone이 필요합니다.'); }
  res.json(buildKpiHistory(metric, range, timeZone, summarize()));
});

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
