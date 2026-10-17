import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoryPoint } from '@ecocycle/shared';
import { HISTORY_EMPTY_TEXT } from '../../config/display';
import { dateTicks, formatDateTick } from './ticks';
import type { HistoryMetric, HistoryUnit } from '../../config/display';

export interface HistoryChartProps {
  points: readonly HistoryPoint[];
  metric: Pick<HistoryMetric, 'label' | 'unit' | 'domain'>;
  /** x축 눈금 형식 */
  tick: HistoryUnit['tick'];
  /** 접근성 설명(예: "탱크 A1 적재율, 10/12 15:00 ~ 10/13 15:00") */
  description: string;
  height?: number;
}

const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const fullFmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * 받은 점만 그리는 표시 전용 꺾은선 그래프. 구간 이동·요청·기억은 features의 useHistoryWindow가 맡는다.
 * 저사양 태블릿을 위해 애니메이션과 점 표시를 끄고, 점 수가 구간당 수백 개 이하라고 가정한다.
 */
export function HistoryChart({ points, metric, tick, description, height = 260 }: HistoryChartProps) {
  if (points.length === 0) {
    return (
      <div role="img" aria-label={`${description}: 기록 없음`} style={{ height }} className="flex items-center justify-center text-slate-500">
        {HISTORY_EMPTY_TEXT}
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const last = points[points.length - 1]!;
  const summary = `${description}. 최소 ${min}${metric.unit}, 최대 ${max}${metric.unit}, 마지막 ${last.value}${metric.unit}`;
  const data = points.map((p) => ({ t: Date.parse(p.ts), value: p.value }));
  // 날짜 눈금은 하루에 하나씩 자정에 찍는다 (점마다 찍으면 같은 날짜가 반복된다)
  const ticks = tick === 'date' ? dateTicks(data[0]!.t, data[data.length - 1]!.t) : undefined;

  return (
    <div role="img" aria-label={summary} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height }}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={ticks}
            tickFormatter={(t: number) => (tick === 'time' ? timeFmt.format(t) : formatDateTick(t))}
            tick={{ fontSize: 12, fill: '#475569' }}
            minTickGap={32}
          />
          <YAxis
            domain={metric.domain === 'auto' ? ['auto', 'auto'] : [metric.domain[0], metric.domain[1]]}
            tick={{ fontSize: 12, fill: '#475569' }}
            width={44}
            unit={metric.unit === '%' ? '%' : undefined}
          />
          <Tooltip
            isAnimationActive={false}
            labelFormatter={(t) => fullFmt.format(Number(t))}
            formatter={(v) => [`${v} ${metric.unit}`, metric.label]}
          />
          <Line type="monotone" dataKey="value" stroke="#1e293b" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
