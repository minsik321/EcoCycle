import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { DeviceId } from '@ecocycle/shared';
import { HistoryChart } from '../../components/charts/HistoryChart';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { DEVICE_NAMES, HISTORY_UNITS, HISTORY_UNIT_ORDER } from '../../config/display';
import type { HistoryMetric } from '../../config/display';
import { useHistoryWindow } from './useHistoryWindow';
import type { UseHistoryWindowOptions } from './useHistoryWindow';

export interface HistoryPanelProps {
  deviceId: DeviceId;
  metrics: readonly HistoryMetric[];
  /** 테스트용 */
  now?: UseHistoryWindowOptions['now'];
  fetcher?: UseHistoryWindowOptions['fetcher'];
}

const SWIPE_MIN_PX = 60;

/**
 * 기기 페이지의 이력 그래프: 단위(일·주·월), 구간 이동(◀ 이전 / 다음 ▶ 또는 좌우로 밀기), 현재 구간 표시.
 * 불러오는 동안은 이전 그래프를 흐리게 두고, 실패하면 그 자리에 오류와 다시 시도 버튼을 보여 준다.
 */
export function HistoryPanel({ deviceId, metrics, now, fetcher }: HistoryPanelProps) {
  const [metricKey, setMetricKey] = useState(metrics[0]?.key ?? '');
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const history = useHistoryWindow({ deviceId, metric: metric?.key ?? '', ...(now ? { now } : {}), ...(fetcher ? { fetcher } : {}) });
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  if (!metric) return null;
  const unit = HISTORY_UNITS[history.unit];

  // 오른쪽으로 밀면 과거, 왼쪽으로 밀면 최근 (페이지를 넘기는 것과 같다)
  const onPointerDown = (e: PointerEvent) => {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0) history.goPrev();
    else if (history.canNext) history.goNext();
  };

  return (
    <Card title={`${DEVICE_NAMES[deviceId]} 이력`} aria-label="이력 그래프" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {metrics.length > 1 ? (
          <div role="group" aria-label="항목" className="flex gap-2">
            {metrics.map((m) => (
              <Button key={m.key} variant={m.key === metric.key ? 'primary' : 'secondary'} aria-pressed={m.key === metric.key} onClick={() => setMetricKey(m.key)}>
                {m.label}
              </Button>
            ))}
          </div>
        ) : (
          <span className="font-semibold text-slate-800">{metric.label}</span>
        )}
        <div role="group" aria-label="단위" className="flex gap-2">
          {HISTORY_UNIT_ORDER.map((key) => (
            <Button key={key} variant={key === history.unit ? 'primary' : 'secondary'} aria-pressed={key === history.unit} onClick={() => history.setUnit(key)}>
              {HISTORY_UNITS[key].label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button onClick={history.goPrev} aria-label="이전 구간">
          ◀ 이전
        </Button>
        <span aria-live="polite" className="text-center text-sm font-medium text-slate-700">
          {history.label}
        </span>
        <Button onClick={history.goNext} disabled={!history.canNext} aria-label="다음 구간">
          다음 ▶
        </Button>
      </div>

      <div className="relative touch-pan-y" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipeStart.current = null)}>
        {history.error ? (
          <div role="alert" className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-status-alarm bg-red-50 p-4 text-center">
            <p className="font-medium text-status-alarm">
              <span aria-hidden="true">✕ </span>이력을 불러오지 못했습니다. {history.error}
            </p>
            <Button onClick={history.retry}>다시 시도</Button>
          </div>
        ) : history.points === null ? (
          <div role="status" className="flex h-64 items-center justify-center text-slate-500">
            이력을 불러오는 중…
          </div>
        ) : (
          <div className={history.loading ? 'opacity-40 transition-opacity' : undefined} aria-busy={history.loading || undefined}>
            <HistoryChart
              points={history.points}
              metric={metric}
              tick={unit.tick}
              description={`${DEVICE_NAMES[deviceId]} ${metric.label}, ${history.label}`}
            />
          </div>
        )}
        {history.loading && history.points !== null && !history.error && (
          <span role="status" className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow">
            불러오는 중…
          </span>
        )}
      </div>
    </Card>
  );
}
