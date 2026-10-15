import type { KpiHistoryResponse, KpiRange, PlantMetric, PlantSummary } from '@ecocycle/shared';

const hour = 3_600_000;
const round = (n: number) => Math.round(n * 10) / 10;
const localDate = (ms: number, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
function midnight(date: string, zone: string) {
  const desired = Date.parse(`${date}T00:00:00Z`);
  let result = desired;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(result);
    const p = Object.fromEntries(parts.map(v => [v.type, v.value]));
    result += desired - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  }
  return result;
}

/** 지난 30일을 같은 시간에는 같은 값으로 생성. 야간·주말 감산, 점심 정지, 수분 완만한 변동. */
export function buildKpiHistory(metric: PlantMetric, range: KpiRange, zone: string, summary: PlantSummary, now = Date.now()): KpiHistoryResponse {
  const today = localDate(now, zone);
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const start = midnight(date, zone);
    const end = Math.min(now, midnight(nextDate, zone));
    const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
    const hours = [];
    for (let t = start; t < end; t += hour) {
      const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(t));
      const duration = (Math.min(t + hour, end) - t) / 60_000;
      const running = duration * (h < 6 || h >= 22 ? 0 : h === 12 ? 0.25 : weekend ? 0.7 : 0.94);
      const moisture = round(11.8 + Math.sin(t / hour / 18) * 1.4 + Math.sin(t / hour * 1.7) * 0.35);
      const bales = Math.round(running * (0.72 + 0.08 * Math.sin(t / hour)));
      hours.push({ ts: new Date(t).toISOString(), duration, running, moisture, bales });
    }
    // 당일 시간별 생산량의 합을 홈 요약과 일치시킨다.
    if (date === today && hours.length) {
      const total = hours.reduce((s, h) => s + h.bales, 0);
      let assigned = 0;
      hours.forEach((h, j) => { h.bales = j === hours.length - 1 ? summary.balesToday - assigned : Math.floor(summary.balesToday * (total ? h.bales / total : 1 / hours.length)); assigned += h.bales; });
    }
    return { start, hours };
  });
  const selected = days.slice(range === 'today' ? -1 : range === '7d' ? -7 : -30);
  const groups = range === 'today' ? selected.flatMap(d => d.hours.map(h => ({ start: Date.parse(h.ts), hours: [h] }))) : selected;
  const points = groups.map(g => {
    const duration = g.hours.reduce((s, h) => s + h.duration, 0);
    const running = g.hours.reduce((s, h) => s + h.running, 0);
    const value = metric === 'balesToday' ? g.hours.reduce((s, h) => s + h.bales, 0) : metric === 'averageMoisturePercent' ? round(g.hours.reduce((s, h) => s + h.moisture * h.duration, 0) / (duration || 1)) : round(running / (duration || 1) * 100);
    return { ts: new Date(g.start).toISOString(), value, ...(metric === 'compressorUptimePercent' ? { runningMinutes: round(running), stoppedMinutes: round(duration - running) } : {}) };
  });
  const values = points.map(p => p.value);
  return { metric, range, from: new Date(selected[0]!.start).toISOString(), to: new Date(now).toISOString(), interval: range === 'today' ? '1h' : '1d', points,
    statistics: { current: summary[metric], average: round(values.reduce((s, n) => s + n, 0) / (values.length || 1)), min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 },
    targetBand: metric === 'averageMoisturePercent' ? { min: 10, max: 14 } : null, updatedAt: new Date(now).toISOString() };
}
