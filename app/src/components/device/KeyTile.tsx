import { Sparkline } from '../common/Sparkline';
import { useDeviceLive } from './live';

export interface KeyTileProps {
  label: string;
  /** 표시할 값(형식을 맞춘 문자열). 아직 받지 못했으면 null */
  value: string | null;
  unit?: string;
  /** 값 옆의 작은 보조 글 (예: "/ 8.0 m³") */
  sub?: string;
  /** 최근 24시간 추이(오래된 것부터). 숫자가 아닌 값(모드 등)에는 넣지 않는다 */
  trend?: readonly number[];
}

/** 기기 페이지의 주요 수치 한 칸: 값, 단위, 작은 추이선. 연결이 끊기면 값은 "–"이고 추이선은 그리지 않는다. */
export function KeyTile({ label, value, unit, sub, trend }: KeyTileProps) {
  const { disconnected } = useDeviceLive();
  const shown = disconnected ? null : value;
  return (
    <div role="group" aria-label={label} className="flex min-h-20 min-w-0 flex-col justify-between rounded-card border border-line bg-surface p-3 shadow-soft-1">
      {/* 추이선은 이름 줄 오른쪽에 둔다. 값 줄에 두면 좁은 칸에서 단위와 겹친다 */}
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-xs font-medium text-ink-soft">{label}</p>
        {shown !== null && trend && <Sparkline values={trend} width={52} height={20} className="-mt-0.5 shrink-0" />}
      </div>
      <p className={`min-w-0 text-2xl leading-tight font-bold ${shown === null ? 'text-ink-faint' : 'text-ink'}`}>
        {shown ?? '–'}
        {shown !== null && unit && <span className="ml-0.5 text-sm font-semibold text-ink-soft">{unit}</span>}
        {shown !== null && sub && <span className="ml-1 text-xs font-medium whitespace-nowrap text-ink-faint">{sub}</span>}
      </p>
    </div>
  );
}

/** 한 페이지의 주요 수치는 4개까지다. 더 넘겨도 앞의 4개만 그린다. */
export const MAX_KEY_TILES = 4;

export function KeyTiles({ tiles }: { tiles: readonly KeyTileProps[] }) {
  return (
    <section aria-label="주요 수치" className="grid grid-cols-2 gap-3">
      {tiles.slice(0, MAX_KEY_TILES).map((tile) => (
        <KeyTile key={tile.label} {...tile} />
      ))}
    </section>
  );
}
