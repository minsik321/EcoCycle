import type { TankState } from '@ecocycle/shared';
import { formatGrade, formatPercent } from '../../config/display';

const CHIP = 'inline-flex shrink-0 items-baseline gap-1 rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ink tabular-nums';

/** 섹터 그림 카드 위의 작은 칩: 수분·등급. 연결이 끊기면 값은 "–" (추이는 자세히의 이력 그래프) */
export function SectorChips({ tank, disconnected }: { tank: TankState; disconnected: boolean }) {
  return (
    <>
      <span role="group" className={CHIP} aria-label="수분">
        <span className="font-medium text-ink-faint">수분</span>
        {disconnected ? '–' : formatPercent(tank.moisturePercent)}
      </span>
      <span role="group" className={CHIP} aria-label="등급">
        {disconnected ? '등급 –' : formatGrade(tank.grade)}
      </span>
    </>
  );
}
