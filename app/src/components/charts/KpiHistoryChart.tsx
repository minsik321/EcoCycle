import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { KpiHistoryResponse } from '@ecocycle/shared';
import { KPI_DISPLAY } from '../../config/kpi';

/** 서버가 집계한 값만 표시. 3D와 함께 열어도 차트 애니메이션 없음. */
export function KpiHistoryChart({ history }: { history: KpiHistoryResponse }) {
  const { metric, points, targetBand, interval } = history;
  const uptime = metric === 'compressorUptimePercent';
  const moisture = metric === 'averageMoisturePercent';
  const { label, unit } = KPI_DISPLAY[metric];
  const tick = (ts: string) => new Intl.DateTimeFormat('ko-KR', interval === '1h' ? { hour: '2-digit', hourCycle: 'h23' } : { month: 'numeric', day: 'numeric' }).format(new Date(ts));
  const data = points.map(p => ({ ...p, stopped: 100 - p.value }));
  return <div role="img" aria-label={`${label} ${interval === '1h' ? '시간별' : '일별'} 그래프`} className="h-60 min-w-0 sm:h-72">
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 240 }}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: -12 }}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 5" />
        <XAxis dataKey="ts" tickFormatter={tick} tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }} minTickGap={24} axisLine={false} tickLine={false} />
        <YAxis width={48} domain={uptime ? [0, 100] : moisture ? [0, Math.max(20, ...points.map(p => p.value))] : [0, 'auto']} allowDecimals={metric !== 'balesToday'} tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }} axisLine={false} tickLine={false} />
        <Tooltip isAnimationActive={false} contentStyle={{ borderRadius: 12, borderColor: 'var(--color-line)', color: 'var(--color-ink)', fontSize: 12 }} itemStyle={{ color: 'var(--color-ink-soft)' }} labelFormatter={ts => new Date(String(ts)).toLocaleString('ko-KR')} formatter={(v, name, item) => {
          if (uptime) { const p = item.payload; return [`${v}% · ${name === '가동' ? p.runningMinutes : p.stoppedMinutes}분`, name]; }
          return [`${v}${unit}`, label];
        }} />
        {targetBand && <ReferenceArea y1={targetBand.min} y2={targetBand.max} fill="var(--color-accent)" fillOpacity={0.09} strokeOpacity={0} />}
        {moisture ? <Line dataKey="value" name={label} type="monotone" stroke="var(--color-accent)" strokeWidth={2} dot={false} isAnimationActive={false} /> : <Bar dataKey="value" name={uptime ? '가동' : label} stackId="uptime" fill="var(--color-accent)" radius={uptime ? undefined : [4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />}
        {uptime && <Bar dataKey="stopped" name="정지" stackId="uptime" fill="var(--color-paper-deep)" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}
