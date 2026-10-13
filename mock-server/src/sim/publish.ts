import type { DeviceState, PlantSummary } from '@ecocycle/shared';
import { publish } from './bus';
import { summarize } from './state';

// 명세: device.state / plant.summary 는 "변할 때, 최소 5초마다" 보낸다.
const MIN_INTERVAL_MS = 5000;

const sentDevices = new Map<string, { key: string; at: number }>();
let sentSummary: { key: string; at: number } | undefined;

function withoutTime<T extends { updatedAt: string }>(value: T): string {
  const { updatedAt: _ignored, ...rest } = value;
  return JSON.stringify(rest);
}

/** 값이 바뀌었거나 마지막 전송 후 5초가 지났으면 device.state를 보낸다. */
export function publishDevice(device: DeviceState, force = false): void {
  const key = withoutTime(device);
  const prev = sentDevices.get(device.id);
  const now = Date.now();
  if (!force && prev && prev.key === key && now - prev.at < MIN_INTERVAL_MS) return;
  device.updatedAt = new Date(now).toISOString();
  sentDevices.set(device.id, { key, at: now });
  publish({ type: 'device.state', state: structuredClone(device) });
}

export function publishSummary(force = false): void {
  const summary: PlantSummary = summarize();
  const key = withoutTime(summary);
  const now = Date.now();
  if (!force && sentSummary && sentSummary.key === key && now - sentSummary.at < MIN_INTERVAL_MS) return;
  sentSummary = { key, at: now };
  publish({ type: 'plant.summary', summary });
}
