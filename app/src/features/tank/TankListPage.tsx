import { Link } from 'react-router-dom';
import type { TankState } from '@ecocycle/shared';
import { StatusBadge } from '../../components/status/StatusBadge';
import { useDeviceLive } from '../../components/device/live';
import { DEVICE_NAMES } from '../../config/display';
import { devicePagePath } from '../../config/navigation';
import { useAppSelector } from '../../store/hooks';
import { selectTanks } from '../../store/selectors';
import { SectorBin } from './SectorBin';
import { SectorChips } from './SectorChips';
import { binLabel } from './sectorText';

/** 섹터 4개를 칸 그림(안에 적재율·부피)으로 한눈에 보고, 누르면 그 섹터의 기기 페이지로 간다. 폰은 한 줄에 2개. */
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
  const { disconnected, lastReceivedAt } = useDeviceLive();
  const name = DEVICE_NAMES[tank.id];

  // 상세와 같은 모양: 위에 이름·상태, 칸 그림 안에 적재율·부피, 아래에 수분·등급 칩
  return (
    <Link
      to={devicePagePath(tank.id)}
      aria-label={`${name} 상세`}
      className="flex h-full min-w-0 flex-col gap-2 rounded-card border border-line bg-surface p-3 shadow-soft-1 active:bg-paper-deep"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-base font-semibold text-ink">{name}</span>
        <StatusBadge status={disconnected ? 'offline' : tank.status} size="sm" />
      </div>
      <div className={`rounded-control bg-paper px-1 pb-1 ${disconnected ? 'opacity-60 grayscale' : ''}`}>
        <SectorBin
          fillPercent={tank.fillPercent}
          volumeM3={tank.volumeM3}
          capacityM3={tank.capacityM3}
          cautionPercent={tank.cautionThresholdPercent}
          label={binLabel(name, tank, disconnected)}
          size="sm"
          frozen={disconnected}
          lastReceivedAt={lastReceivedAt}
          showCautionLabel={false}
          className="w-full"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <SectorChips tank={tank} disconnected={disconnected} />
      </div>
    </Link>
  );
}
