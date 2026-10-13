import { Link } from 'react-router-dom';
import { StatusBadge } from '../../components/status/StatusBadge';
import { useDisplayStatus } from '../../components/status/useDisplayStatus';
import { BAR_CLASS } from '../../components/status/tone';
import { DEVICE_NAMES, formatPercent } from '../../config/display';
import { devicePagePath } from '../../config/navigation';
import { useAppSelector } from '../../store/hooks';
import { selectTanks } from '../../store/selectors';

/** 탱크 4개를 한눈에 보고, 누르면 그 탱크의 기기 페이지로 간다. */
export function TankListPage() {
  const tanks = useAppSelector(selectTanks);
  const { disconnected, show } = useDisplayStatus();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">탱크</h1>
      {tanks.length === 0 ? (
        <p role="status" className="text-slate-500">
          탱크 상태를 불러오는 중…
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tanks.map((tank) => {
            const status = show(tank.status);
            return (
              <li key={tank.id}>
                <Link
                  to={devicePagePath(tank.id)}
                  className="flex min-h-12 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold text-slate-800">{DEVICE_NAMES[tank.id]}</span>
                    <StatusBadge status={status} size="sm" />
                  </span>
                  <span className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                    <span className={`block h-full ${BAR_CLASS[status]}`} style={{ width: `${Math.min(100, Math.max(0, tank.fillPercent))}%` }} />
                  </span>
                  <span className={`text-2xl font-bold ${disconnected ? 'text-slate-400' : 'text-slate-900'}`}>{formatPercent(tank.fillPercent)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
