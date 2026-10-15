import { Router } from 'express';
import type { DeviceListResponse, HistoryResponse, TankId } from '@ecocycle/shared';
import { TANK_IDS } from '@ecocycle/shared';
import { sendError } from '../errors';
import { buildHistory, MAX_HISTORY_POINTS, parseInterval, supportedMetrics } from '../sim/history';
import { devices, isDeviceId, listDevices, summarize } from '../sim/state';
import { unloadRecords } from '../sim/unloads';
import { sendRecordPage } from './records';

export const devicesRouter = Router();

devicesRouter.get('/plant/summary', (_req, res) => {
  res.json(summarize());
});

devicesRouter.get('/devices', (_req, res) => {
  const body: DeviceListResponse = listDevices();
  res.json(body);
});

devicesRouter.get('/devices/:id/state', (req, res) => {
  const id = req.params.id;
  if (!isDeviceId(id)) return sendError(res, 422, 'VALIDATION_FAILED', `알 수 없는 기기 ID: ${id}`);
  res.json(devices[id]);
});

// GET /devices/{id}/history?metric=level&from=...&to=...&interval=10m
devicesRouter.get('/devices/:id/history', (req, res) => {
  const id = req.params.id;
  if (!isDeviceId(id)) return sendError(res, 422, 'VALIDATION_FAILED', `알 수 없는 기기 ID: ${id}`);
  const device = devices[id];

  const { metric, from, to, interval } = req.query;
  if (typeof metric !== 'string' || typeof from !== 'string' || typeof to !== 'string' || typeof interval !== 'string') {
    return sendError(res, 422, 'VALIDATION_FAILED', 'metric, from, to, interval이 필요합니다.');
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

  const points = buildHistory(device, metric, fromMs, toMs, intervalMs);
  if (!points) {
    const list = supportedMetrics(device.type).join(', ') || '없음';
    return sendError(res, 422, 'VALIDATION_FAILED', `이 기기에서 지원하는 metric: ${list}`);
  }
  const body: HistoryResponse = {
    deviceId: id,
    metric,
    interval,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    points,
  };
  res.json(body);
});

const isTankId = (value: string): value is TankId => (TANK_IDS as readonly string[]).includes(value);

// GET /devices/{id}/unloads/records?from=...&to=...&page=1&pageSize=10 — 섹터(탱크) 하나의 하역 기록
devicesRouter.get('/devices/:id/unloads/records', (req, res) => {
  const id = req.params.id;
  if (!isTankId(id)) return sendError(res, 422, 'VALIDATION_FAILED', `하역 기록은 섹터(탱크) 기기에만 있습니다: ${id}`);
  sendRecordPage(req, res, unloadRecords(id), (r) => r.unloadedAt);
});
