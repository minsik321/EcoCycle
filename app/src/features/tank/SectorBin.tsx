import { useId } from 'react';

// 섹터 그림: 위와 앞이 트인 콘크리트 칸(벙커)을 비스듬히 위에서 본 모양. 안에는 크라프트 파지가 적재율만큼 쌓여 있고,
// 서버가 준 주의 기준 적재율에 점선을 긋는다. 값이 바뀌면 파지 더미가 부드럽게 오르내린다(CSS transform 전환).
// 연결이 끊기면 감싸는 쪽이 data-frozen으로 전환을 멈추고 흐리게 한다. 값을 계산하지 않고 받은 %를 높이로 옮길 뿐이다.

// 그림 좌표 (viewBox 단위)
const X0 = 18; // 앞면 왼쪽
const YB = 150; // 앞면 바닥
const W = 150; // 칸 너비
const H = 100; // 벽 높이 = 100%
const DX = 44; // 깊이 방향 (뒤로 갈수록 오른쪽 위)
const DY = -30;
const T = 7; // 벽 두께
const VIEW = { x: 0, y: YB + DY - H - 10, w: X0 + W + T + DX + 40, h: H - DY + 18 };

const pt = (x: number, y: number) => `${x},${y}`;
const quad = (...points: Array<[number, number]>) => points.map(([x, y]) => pt(x, y)).join(' ');

export interface SectorBinProps {
  /** 적재율 % (서버 값). 아직 모르면 null이고 칸만 그린다 */
  fillPercent: number | null;
  /** 주의 기준 적재율 % (서버 설정의 현재값). 모르면 선을 긋지 않는다 */
  cautionPercent: number | null;
  /** 화면 읽기용 설명 */
  label: string;
  /** 기준선 옆 글자를 보일지 (작은 목록 그림에서는 끈다) */
  showCautionLabel?: boolean;
  className?: string;
}

export function SectorBin({ fillPercent, cautionPercent, label, showCautionLabel = true, className = '' }: SectorBinProps) {
  // 한 화면에 여러 개가 있어도 무늬·자르기 ID가 겹치지 않게
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const paper = `bin-paper-${uid}`;
  const clip = `bin-clip-${uid}`;

  const level = fillPercent === null ? 0 : (Math.min(100, Math.max(0, fillPercent)) / 100) * H;
  const caution = cautionPercent === null ? null : (Math.min(100, Math.max(0, cautionPercent)) / 100) * H;

  // 칸 안쪽 전체(앞면 + 뒤로 물러난 윤곽). 파지 더미는 이 안에서만 보인다
  const inside = quad([X0, YB], [X0 + W, YB], [X0 + W + DX, YB + DY], [X0 + W + DX, YB + DY - H], [X0 + DX, YB + DY - H], [X0, YB - H]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={`block ${className}`}
    >
      <defs>
        {/* 크라프트 파지 무늬: 바탕색 위에 찢긴 종이 조각과 섬유 */}
        {/* 크라프트 파지 무늬: 크기·각도가 제각각인 종이 조각과 섬유. 타일을 기울여 줄무늬처럼 보이지 않게 한다 */}
        <pattern id={paper} width="44" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(-11)">
          <rect width="44" height="36" fill="var(--color-kraft)" />
          <polygon points="2,4 15,1 17,8 4,11" fill="var(--color-kraft-light)" />
          <polygon points="21,2 33,5 31,10 20,8" fill="var(--color-kraft-deep)" opacity="0.5" />
          <polygon points="35,1 43,3 42,9 36,7" fill="var(--color-kraft-soft)" opacity="0.75" />
          <polygon points="8,14 19,17 16,23 6,20" fill="var(--color-kraft-deep)" opacity="0.4" />
          <polygon points="23,13 38,12 37,19 25,21" fill="var(--color-kraft-light)" opacity="0.85" />
          <polygon points="1,25 9,24 10,31 2,33" fill="var(--color-kraft-soft)" opacity="0.6" />
          <polygon points="14,27 27,25 29,31 15,34" fill="var(--color-kraft-light)" opacity="0.7" />
          <polygon points="32,24 42,27 40,34 31,31" fill="var(--color-kraft-deep)" opacity="0.35" />
          <path d="M1 13 L7 12 M18 11 L24 12 M39 16 L44 14 M11 34 L20 35 M27 22 L33 23" stroke="var(--color-kraft-deep)" strokeWidth="0.8" opacity="0.55" />
        </pattern>
        <clipPath id={clip}>
          <polygon points={inside} />
        </clipPath>
      </defs>

      {/* 바닥 그림자 */}
      <ellipse cx={X0 + (W + DX) / 2 + 4} cy={YB + 6} rx={(W + DX) / 2 + 8} ry="7" fill="var(--color-ink)" opacity="0.06" />

      {/* 바닥 */}
      <polygon points={quad([X0, YB], [X0 + W, YB], [X0 + W + DX, YB + DY], [X0 + DX, YB + DY])} fill="var(--color-concrete-shade)" />
      {/* 뒷벽 안쪽 면 */}
      <rect x={X0 + DX} y={YB + DY - H} width={W} height={H} fill="var(--color-concrete)" />
      {/* 왼쪽 벽 안쪽 면 (오른쪽을 본다, 조금 어둡게) */}
      <polygon points={quad([X0, YB], [X0 + DX, YB + DY], [X0 + DX, YB + DY - H], [X0, YB - H])} fill="var(--color-concrete-shade)" />

      {/* 주의선: 벽 안쪽을 따라 (더미에 가려질 수 있다) */}
      {caution !== null && (
        <polyline
          points={quad([X0, YB - caution], [X0 + DX, YB + DY - caution], [X0 + W + DX, YB + DY - caution])}
          fill="none"
          stroke="var(--color-status-caution)"
          strokeWidth="1.5"
          strokeDasharray="5 4"
          opacity="0.75"
        />
      )}

      {/* 파지 더미: 꽉 찬 더미를 그려 두고 비어 있는 만큼 아래로 내린다 (전환이 부드럽고 무늬가 늘어나지 않는다) */}
      {fillPercent !== null && (
        <g clipPath={`url(#${clip})`}>
          <g data-testid="bin-pile" style={{ transform: `translateY(${Math.round((H - level) * 100) / 100}px)`, transition: 'transform 1.2s ease-in-out' }}>
            {/* 윗면 */}
            <polygon points={quad([X0, YB - H], [X0 + W, YB - H], [X0 + W + DX, YB + DY - H], [X0 + DX, YB + DY - H])} fill={`url(#${paper})`} />
            <polygon points={quad([X0, YB - H], [X0 + W, YB - H], [X0 + W + DX, YB + DY - H], [X0 + DX, YB + DY - H])} fill="#fff" opacity="0.2" />
            {/* 앞면 (트인 앞쪽으로 보이는 단면) */}
            <rect x={X0} y={YB - H} width={W} height={H} fill={`url(#${paper})`} />
            <rect x={X0} y={YB - H} width={W} height={H} fill="var(--color-ink)" opacity="0.07" />
            {/* 더미 윗가장자리의 들쭉날쭉한 종이 끝 */}
            <path
              d={`M${X0} ${YB - H} q6 -4 12 -1 t14 0 t13 -1 t15 1 t12 -1 t14 0 t13 1 t15 -1 t12 0 t14 1 t13 -1 L${X0 + W} ${YB - H} Z`}
              fill="var(--color-kraft-light)"
            />
            <line x1={X0} y1={YB - H} x2={X0 + W} y2={YB - H} stroke="var(--color-kraft-deep)" strokeWidth="1" opacity="0.6" />
          </g>
        </g>
      )}

      {/* 오른쪽 벽: 바깥 면과 윗면 */}
      <polygon points={quad([X0 + W, YB], [X0 + W + T, YB], [X0 + W + T + DX, YB + DY], [X0 + W + DX, YB + DY])} fill="var(--color-concrete-shade)" />
      <polygon points={quad([X0 + W + T, YB], [X0 + W + T + DX, YB + DY], [X0 + W + T + DX, YB + DY - H], [X0 + W + T, YB - H])} fill="var(--color-concrete-shade)" />
      <rect x={X0 + W} y={YB - H} width={T} height={H} fill="var(--color-concrete)" />
      <polygon points={quad([X0 + W, YB - H], [X0 + W + T, YB - H], [X0 + W + T + DX, YB + DY - H], [X0 + W + DX, YB + DY - H])} fill="var(--color-concrete-top)" />
      {/* 왼쪽 벽: 앞 끝면과 윗면 */}
      <rect x={X0 - T} y={YB - H} width={T} height={H} fill="var(--color-concrete)" />
      <polygon points={quad([X0 - T, YB - H], [X0, YB - H], [X0 + DX, YB + DY - H], [X0 - T + DX, YB + DY - H])} fill="var(--color-concrete-top)" />
      {/* 뒷벽 윗면 */}
      <polygon
        points={quad([X0 + DX - T, YB + DY - H], [X0 + W + DX + T, YB + DY - H], [X0 + W + DX + T + 5, YB + DY - H - 4], [X0 + DX - T + 5, YB + DY - H - 4])}
        fill="var(--color-concrete-top)"
      />
      {/* 벽 가장자리 */}
      <g fill="none" stroke="var(--color-concrete-edge)" strokeWidth="1" strokeLinejoin="round">
        <rect x={X0 - T} y={YB - H} width={T} height={H} />
        <rect x={X0 + W} y={YB - H} width={T} height={H} />
        <polyline points={quad([X0 + W + T, YB], [X0 + W + T + DX, YB + DY], [X0 + W + T + DX, YB + DY - H], [X0 + W + T, YB - H])} />
      </g>

      {/* 주의선: 트인 앞쪽과 오른쪽 벽 바깥에 (더미 위에 그어 늘 보인다) */}
      {caution !== null && (
        <g data-testid="bin-caution">
          <line x1={X0 - T} y1={YB - caution} x2={X0 + W + T} y2={YB - caution} stroke="var(--color-status-caution)" strokeWidth="2" strokeDasharray="6 4" />
          <line
            x1={X0 + W + T}
            y1={YB - caution}
            x2={X0 + W + T + DX}
            y2={YB + DY - caution}
            stroke="var(--color-status-caution)"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          {showCautionLabel && (
            <text x={X0 + W + T + DX + 4} y={YB + DY - caution + 4} fontSize="12" fontWeight="700" fill="var(--color-status-caution)">
              {Math.round(cautionPercent ?? 0)}%
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
