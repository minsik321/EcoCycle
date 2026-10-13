import type { DeviceState, HistoryPoint } from '@ecocycle/shared';

/** 기기 종류별로 조회할 수 있는 metric과 현재 값을 읽는 방법 */
const METRICS: Record<DeviceState['type'], Record<string, (d: DeviceState) => number>> = {
  tank: {
    level: (d) => (d.type === 'tank' ? d.fillPercent : 0),
    moisture: (d) => (d.type === 'tank' ? d.moisturePercent : 0),
    volume: (d) => (d.type === 'tank' ? d.volumeM3 : 0),
  },
  conveyor: { load: (d) => (d.type === 'conveyor' ? d.loadPercent : 0) },
  compressor: {
    pressure: (d) => (d.type === 'compressor' ? d.pressureMpa : 0),
    temperature: (d) => (d.type === 'compressor' ? d.temperatureC : 0),
  },
  robot: {},
};

export const MAX_HISTORY_POINTS = 1000;

export function supportedMetrics(type: DeviceState['type']): string[] {
  return Object.keys(METRICS[type]);
}

/** "10m", "1h", "6h", "1d" → 밀리초. 형식이 틀리면 undefined */
export function parseInterval(text: string): number | undefined {
  const m = /^(\d+)(m|h|d)$/.exec(text);
  if (!m) return undefined;
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 'm' | 'h' | 'd'];
  const ms = Number(m[1]) * unit;
  return ms > 0 ? ms : undefined;
}

// 같은 시각이면 항상 같은 값이 나오는 가짜 잡음 (재요청해도 그래프가 흔들리지 않게)
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/**
 * 현재 값 주변에서 천천히 오르내리는 가짜 이력을 만든다.
 * 시각 t의 값은 t만으로 정해지므로 같은 구간을 다시 요청하면 같은 결과가 나온다.
 */
export function buildHistory(
  device: DeviceState,
  metric: string,
  fromMs: number,
  toMs: number,
  intervalMs: number,
): HistoryPoint[] | undefined {
  const read = METRICS[device.type][metric];
  if (!read) return undefined;
  const current = read(device);
  const isPercent = metric !== 'volume' && metric !== 'pressure' && metric !== 'temperature';
  const amp = Math.max(Math.abs(current) * 0.15, 1);

  const points: HistoryPoint[] = [];
  const start = Math.ceil(fromMs / intervalMs) * intervalMs;
  for (let t = start; t <= toMs; t += intervalMs) {
    const wave = Math.sin(t / 3_600_000 / 3) * amp * 0.6;
    let value = current + wave + noise(t / intervalMs) * amp * 0.3;
    if (isPercent) value = Math.min(100, Math.max(0, value));
    points.push({ ts: new Date(t).toISOString(), value: Math.round(value * 10) / 10 });
  }
  return points;
}
