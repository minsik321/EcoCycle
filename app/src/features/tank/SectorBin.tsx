import { useId } from 'react';
import { formatLocalClock, formatPercent, formatVolumeM3 } from '../../config/display';

// 섹터 그림: 위가 트인 납작한 2D 칸(사각 통). 안에는 크라프트 파지가 아래에서 적재율만큼 차 있고,
// 서버가 준 주의 기준 적재율에 가는 점선(+ 글자)을 긋는다. 값이 바뀌면 채움이 부드럽게 오르내린다(CSS transform 전환).
// 적재율(큰 글자)과 부피(그 아래)는 채움 윗선 바로 위, 비어 있는 밝은 곳에 붙는다. 거의 다 차면 칸 위 여백(headroom)까지
// 올라가므로 파지 무늬 위에 글자가 놓이는 일이 없다. 연결이 끊기면(frozen) 전환을 멈추고 글자는 "–"와 마지막 수신 시각이다.
// 값을 계산하지 않고 받은 %를 높이로 옮길 뿐이다. 섹터 목록(sm)과 상세(lg)가 같은 그림을 쓴다.

// 그림 좌표 (viewBox 단위)
const X0 = 16; // 칸 안쪽 왼쪽
const W = 140; // 칸 안쪽 너비
const Y0 = 14; // 칸 안쪽 위 = 100%
const H = 100; // 칸 안쪽 높이 (100% = 100단위)
const WALL = 6; // 벽 두께
const VIEW = { w: X0 + W + WALL + 34, h: Y0 + H + WALL + 10 }; // 오른쪽에 기준선 글자 자리
const FLOOR = Y0 + H;
const EASE = '1.2s ease-in-out';

// 글자 크기별: 숫자 두 줄 높이(rem)보다 조금 큰 칸 위 여백. 100%로 차도 글자가 이 여백 안에 들어간다
const SIZE = {
  lg: { headroom: 'pt-16', value: 'text-3xl leading-9', sub: 'text-sm leading-5' },
  sm: { headroom: 'pt-12', value: 'text-xl leading-7', sub: 'text-xs leading-4' },
} as const;

export interface SectorBinProps {
  /** 적재율 % (서버 값). 아직 모르면 null이고 칸만 그린다 */
  fillPercent: number | null;
  /** 지금 부피·용량 m³ (서버 값). 모르면 null */
  volumeM3: number | null;
  capacityM3: number | null;
  /** 주의 기준 적재율 % (서버 설정의 현재값). 모르면 선을 긋지 않는다 */
  cautionPercent: number | null;
  /** 화면 읽기용 설명 */
  label: string;
  /** lg: 상세 페이지, sm: 섹터 목록 */
  size?: 'lg' | 'sm';
  /** 연결 끊김: 전환을 멈추고 숫자 대신 "–"와 마지막 수신 시각 */
  frozen?: boolean;
  lastReceivedAt?: string | null;
  /** 기준선 옆 글자를 보일지 (작은 목록 그림에서는 끈다) */
  showCautionLabel?: boolean;
  className?: string;
}

const clampPercent = (n: number) => Math.min(100, Math.max(0, n));
const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

export function SectorBin({
  fillPercent,
  volumeM3,
  capacityM3,
  cautionPercent,
  label,
  size = 'lg',
  frozen = false,
  lastReceivedAt = null,
  showCautionLabel = true,
  className = '',
}: SectorBinProps) {
  // 한 화면에 여러 개가 있어도 무늬·자르기 ID가 겹치지 않게
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const paper = `bin-paper-${uid}`;
  const clip = `bin-clip-${uid}`;

  const level = fillPercent === null ? 0 : (clampPercent(fillPercent) / 100) * H;
  const caution = cautionPercent === null ? null : (clampPercent(cautionPercent) / 100) * H;
  const cautionY = caution === null ? 0 : FLOOR - caution;
  // 채움 윗선이 그림 아래에서 얼마나 위에 있는지 (그림 높이 %)
  const lineFromBottom = ((VIEW.h - FLOOR + level) / VIEW.h) * 100;
  const transition = frozen ? 'none' : undefined;
  const text = SIZE[size];

  const value = frozen || fillPercent === null ? '–' : formatPercent(fillPercent);
  let sub: string | null = null;
  if (frozen) sub = `마지막 수신 ${formatLocalClock(lastReceivedAt)}`;
  else if (volumeM3 !== null && capacityM3 !== null) sub = `${volumeM3.toFixed(1)} / ${formatVolumeM3(capacityM3)}`;

  return (
    <div data-frozen={frozen ? 'true' : undefined} className={`${text.headroom} ${className}`}>
      <div className="relative w-full" style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
        <svg role="img" aria-label={label} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 block h-full w-full">
          <defs>
            {/* 은은한 파지 무늬: 같은 바탕색 위에 낮은 대비의 종잇조각과 섬유 */}
            <pattern id={paper} width="36" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(-9)">
              <rect width="36" height="28" fill="var(--color-kraft)" />
              <polygon points="2,3 13,1 15,7 3,9" fill="var(--color-kraft-light)" opacity="0.55" />
              <polygon points="19,2 30,4 28,9 18,7" fill="var(--color-kraft-deep)" opacity="0.18" />
              <polygon points="6,13 17,15 15,21 5,19" fill="var(--color-kraft-deep)" opacity="0.14" />
              <polygon points="22,14 34,13 33,19 23,20" fill="var(--color-kraft-light)" opacity="0.5" />
              <path d="M1 25 L9 24 M16 26 L24 25 M28 8 L35 9" stroke="var(--color-kraft-deep)" strokeWidth="0.7" opacity="0.3" />
            </pattern>
            <clipPath id={clip}>
              <rect x={X0} y={Y0} width={W} height={H} />
            </clipPath>
          </defs>

          {/* 칸 안쪽 빈 곳 */}
          <rect x={X0} y={Y0} width={W} height={H} fill="var(--color-concrete)" />

          {/* 파지 채움: 꽉 찬 사각을 그려 두고 비어 있는 만큼 아래로 내린다 (전환이 부드럽고 무늬가 늘어나지 않는다) */}
          {fillPercent !== null && (
            <g clipPath={`url(#${clip})`}>
              <g data-testid="bin-pile" style={{ transform: `translateY(${Math.round((H - level) * 100) / 100}px)`, transition: transition ?? `transform ${EASE}` }}>
                <rect x={X0} y={Y0} width={W} height={H} fill={`url(#${paper})`} />
                {/* 윗가장자리: 채움보다 살짝 짙은 선 */}
                <line x1={X0} y1={Y0 + 1} x2={X0 + W} y2={Y0 + 1} stroke="var(--color-kraft-deep)" strokeWidth="2" />
              </g>
            </g>
          )}

          {/* 칸 벽: 왼쪽·오른쪽·바닥만(위는 트임) */}
          <path
            d={`M${X0 - WALL / 2} ${Y0 - 4} V${FLOOR + WALL / 2} H${X0 + W + WALL / 2} V${Y0 - 4}`}
            fill="none"
            stroke="var(--color-concrete-edge)"
            strokeWidth={WALL}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* 주의선: 가는 점선 (채움 위에 그어 늘 보인다), 오른쪽 바깥에 "주의"와 기준값 */}
          {caution !== null && (
            <g data-testid="bin-caution">
              <line x1={X0} y1={cautionY} x2={X0 + W + WALL + 3} y2={cautionY} stroke="var(--color-status-caution)" strokeWidth="1.25" strokeDasharray="4 3" />
              {showCautionLabel && (
                <text x={X0 + W + WALL + 6} y={cautionY - 3} fontWeight="700" fill="var(--color-status-caution)">
                  <tspan fontSize="9">주의</tspan>
                  <tspan x={X0 + W + WALL + 6} dy="12" fontSize="12">
                    {Math.round(cautionPercent ?? 0)}%
                  </tspan>
                </text>
              )}
            </g>
          )}
        </svg>

        {/* 적재율·부피: 채움 윗선 바로 위(밝은 빈 곳 또는 칸 위 여백). 주의 점선이 지나가도 읽히게 옅은 바탕 */}
        <div
          data-testid="bin-reading"
          className="pointer-events-none absolute rounded-control bg-concrete-top/70 px-1 whitespace-nowrap"
          style={{ left: pct(((X0 + 2) / VIEW.w) * 100), bottom: `calc(${pct(lineFromBottom)} + 3px)`, transition: transition ?? `bottom ${EASE}` }}
        >
          <p className={`font-bold tabular-nums ${text.value} ${frozen ? 'text-ink-faint' : 'text-ink'}`}>{value}</p>
          {sub && <p className={`font-semibold tabular-nums text-ink-soft ${text.sub}`}>{sub}</p>}
        </div>
      </div>
    </div>
  );
}
