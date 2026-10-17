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
  /** 글로 된 값(예: "A2 집기", "결속·배출")은 'text': 숫자보다 작게 적어 반 칸에서 꺾이지 않게 한다 */
  kind?: 'number' | 'text';
  /** 작은 게이지: 지금 값과 목표 눈금의 위치(0~1). 값이 목표와 같은 숫자를 다시 그리지 않고 막대로만 보여 준다 */
  gauge?: { fraction: number; target?: number | null };
}

/** 기기 페이지의 주요 수치 한 칸: 값, 단위, 작은 추이선. 연결이 끊기면 값은 "–"이고 추이선은 그리지 않는다. */
export function KeyTile({ label, value, unit, sub, trend, kind = 'number', gauge }: KeyTileProps) {
  const { disconnected } = useDeviceLive();
  const shown = disconnected ? null : value;
  return (
    <div role="group" aria-label={label} className="flex min-h-20 min-w-0 flex-col justify-between rounded-card border border-line bg-surface p-3 shadow-soft-1">
      {/* 추이선은 이름 줄 오른쪽에 둔다. 값 줄에 두면 좁은 칸에서 단위와 겹친다 */}
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-xs font-medium text-ink-soft">{label}</p>
        {shown !== null && trend && <Sparkline values={trend} width={52} height={20} className="-mt-0.5 shrink-0" />}
      </div>
      <p
        className={`min-w-0 font-bold ${kind === 'text' && shown !== null ? 'truncate text-lg leading-snug md:text-base' : 'text-2xl leading-tight'} ${shown === null ? 'text-ink-faint' : 'text-ink'}`}
      >
        {shown ?? '–'}
        {shown !== null && unit && <span className="ml-0.5 text-sm font-semibold text-ink-soft">{unit}</span>}
        {/* 보조 글: 폰에서는 값 옆, 태블릿의 좁은 반 칸에서는 값 아래 줄 (값과 단위 사이에서 꺾이지 않게) */}
        {shown !== null && sub && <span className="ml-1 text-xs font-medium whitespace-nowrap text-ink-faint md:ml-0 md:block">{sub}</span>}
      </p>
      {gauge && (
        <div
          data-testid="tile-gauge"
          aria-hidden="true"
          className={`relative mt-2 h-2 rounded-full bg-paper-deep ${shown === null ? 'opacity-50' : ''}`}
        >
          {shown !== null && (
            <>
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(Math.min(1, Math.max(0, gauge.fraction)) * 100)}%` }} />
              {gauge.target != null && (
                <div className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink" style={{ left: `${Math.round(Math.min(1, Math.max(0, gauge.target)) * 100)}%` }} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 한 페이지의 주요 수치는 4개까지다. 더 넘겨도 앞의 4개만 그린다. */
export const MAX_KEY_TILES = 4;

const WIDE_COLUMNS: Record<number, string> = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };

/**
 * 주요 수치 격자. 기본은 두 칸씩(반 칸 폭의 오른쪽 열용).
 * `wide`이면 폭 전체를 쓰는 페이지(그림 없음)용으로, 태블릿 이상에서 칸 수만큼 한 줄에 늘어놓는다.
 */
export function KeyTiles({ tiles, wide = false }: { tiles: readonly KeyTileProps[]; wide?: boolean }) {
  const shown = tiles.slice(0, MAX_KEY_TILES);
  return (
    <section aria-label="주요 수치" className={`grid grid-cols-2 gap-3 ${wide ? (WIDE_COLUMNS[shown.length] ?? 'md:grid-cols-4') : ''}`}>
      {shown.map((tile) => (
        <KeyTile key={tile.label} {...tile} />
      ))}
    </section>
  );
}
