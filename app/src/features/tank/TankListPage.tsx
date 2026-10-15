import { Link } from 'react-router-dom';
import type { TankState } from '@ecocycle/shared';
import { StatusBadge } from '../../components/status/StatusBadge';
import { useDisplayStatus } from '../../components/status/useDisplayStatus';
import { DEVICE_NAMES, formatGrade, formatPercent, formatVolumeM3 } from '../../config/display';
import { devicePagePath } from '../../config/navigation';
import { useAppSelector } from '../../store/hooks';
import { selectTanks } from '../../store/selectors';
import { SectorBin } from './SectorBin';
import { binLabel } from './sectorText';

/** 섹터 4개를 칸 그림으로 한눈에 보고, 누르면 그 섹터의 기기 페이지로 간다. 폰은 한 줄에 2개. */
export function TankListPage() {
  const tanks = useAppSelector(selectTanks);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">섹터</h1>
      {tanks.length === 0 ? (
        <p role="status" className="text-ink-soft">
          섹터 상태를 불러오는 중…
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
          {tanks.map((tank) => (
            <li key={tank.id} className="min-w-0">
              <SectorCard tank={tank} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectorCard({ tank }: { tank: TankState }) {
  const { disconnected, show } = useDisplayStatus();
  const name = DEVICE_NAMES[tank.id];
  const value = (text: string) => (disconnected ? '–' : text);

  return (
    <Link
      to={devicePagePath(tank.id)}
      aria-label={`${name} 상세`}
      className="flex h-full min-w-0 flex-col gap-2 rounded-card border border-line bg-surface p-3 shadow-soft-1 active:bg-paper-deep"
    >
      <div
        data-frozen={disconnected ? 'true' : undefined}
        className={`relative rounded-control bg-paper px-1 pt-7 pb-1 ${disconnected ? 'opacity-60 grayscale' : ''}`}
      >
        <StatusBadge status={show(tank.status)} size="sm" className="absolute top-1.5 left-1.5" />
        <SectorBin
          fillPercent={tank.fillPercent}
          cautionPercent={tank.cautionThresholdPercent}
          label={binLabel(name, tank, disconnected)}
          showCautionLabel={false}
          className="h-auto w-full"
        />
      </div>

      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate text-base font-semibold text-ink">{name}</span>
        <span className="shrink-0 text-xs font-semibold whitespace-nowrap text-ink-soft">{formatGrade(tank.grade)}</span>
      </div>
      <p className={`text-2xl leading-none font-bold tabular-nums ${disconnected ? 'text-ink-faint' : 'text-ink'}`}>{value(formatPercent(tank.fillPercent))}</p>
      <dl className="flex flex-col gap-0.5 text-sm">
        <div className="kv-row">
          <dt className="sr-only">부피</dt>
          <dd className="text-left text-ink">
            {disconnected ? '–' : `${tank.volumeM3.toFixed(1)} / ${formatVolumeM3(tank.capacityM3)}`}
          </dd>
        </div>
        <div className="kv-row">
          <dt className="text-ink-faint">수분</dt>
          <dd className="text-ink">{value(formatPercent(tank.moisturePercent))}</dd>
        </div>
      </dl>
    </Link>
  );
}
