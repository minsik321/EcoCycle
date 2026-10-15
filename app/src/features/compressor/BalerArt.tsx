import type { CSSProperties } from 'react';
import type { CompressorCycleStage } from '@ecocycle/shared';
import { PRESSURE_GAUGE_MPA, formatPressureMpa, formatTemperatureC } from '../../config/display';

// 그림 두 장: 베일러(투입구·압축실·피스톤·배출구, viewBox 200×160)와 원형 압력 게이지(같은 좌표계의 오른쪽 부분만 잘라 쓴다).
// 폰의 넓은 칸에서는 옆으로, 태블릿의 세로로 긴 칸에서는 위아래로 놓아 어느 쪽에서도 너무 작아지지 않게 한다.
const GAUGE = { x: 248, y: 78, r: 50 };
/** 게이지 눈금이 차지하는 각도(도). 아래쪽 120도는 비워 둔다 */
const SWEEP = 240;
const START = 90 + (360 - SWEEP) / 2; // 왼쪽 아래에서 시작해 시계 방향

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ratio = (mpa: number) => clamp01((mpa - PRESSURE_GAUGE_MPA.min) / (PRESSURE_GAUGE_MPA.max - PRESSURE_GAUGE_MPA.min));

/** 게이지 위의 점 (각도는 화면 기준: 0도 = 오른쪽, 시계 방향) */
function polar(t: number, r: number) {
  const a = ((START + SWEEP * t) * Math.PI) / 180;
  return { x: GAUGE.x + Math.cos(a) * r, y: GAUGE.y + Math.sin(a) * r };
}

function arc(t0: number, t1: number, r: number): string {
  const a = polar(t0, r);
  const b = polar(t1, r);
  const large = SWEEP * (t1 - t0) > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export interface BalerArtProps {
  /** 서버 값. 받기 전이거나 끊기면 null(바늘·숫자를 그리지 않는다) */
  pressureMpa: number | null;
  temperatureC: number | null;
  /** 지금 배치의 목표 압력 (없으면 null) */
  targetMpa: number | null;
  stage: CompressorCycleStage | null;
  running: boolean;
}

/**
 * 압축기 기기 페이지 맨 위 그림: 베일러와 원형 압력 게이지(지금 압력 vs 지금 배치의 목표)와 온도.
 * 피스톤은 사이클 단계(서버 \`cycleStage\`)를 따라 움직인다: 압축이면 밀고, 결속·배출이면 베일이 나간다. 멈췄으면 움직이지 않는다.
 * 끊기면 감싸는 DeviceHero가 data-frozen으로 움직임을 멈추고, 숫자는 "–"가 된다(값은 부모가 null로 넘긴다).
 */
export function BalerArt({ pressureMpa, temperatureC, targetMpa, stage, running }: BalerArtProps) {
  const pressing = running && stage === 'pressing';
  const ejecting = running && stage === 'ejecting';
  const filling = running && stage === 'filling';
  const value = pressureMpa === null ? null : ratio(pressureMpa);
  const target = targetMpa === null ? null : ratio(targetMpa);
  const label = [
    '압축기 그림',
    pressureMpa === null ? '압력 –' : `압력 ${formatPressureMpa(pressureMpa)}`,
    targetMpa === null ? null : `목표 ${formatPressureMpa(targetMpa)}`,
    temperatureC === null ? '온도 –' : `온도 ${formatTemperatureC(temperatureC)}`,
  ]
    .filter(Boolean)
    .join(', ');
  const ticks = Array.from({ length: 8 }, (_, i) => i / 7);

  return (
    <div role="img" aria-label={label} className="flex h-full w-full items-center justify-center gap-1 p-1 md:flex-col md:p-3">
      <svg aria-hidden="true" viewBox="0 0 200 160" preserveAspectRatio="xMidYMid meet" className="h-full min-h-0 w-full min-w-0 flex-[200_1_0%] md:flex-1">
        {/* 바닥 */}
        <line x1="8" y1="146" x2="190" y2="146" className="stroke-line" strokeWidth="2" />
        {/* 투입구: 투입 중이면 파지 조각이 보인다 */}
        <path d="M 52 30 L 108 30 L 98 52 L 62 52 Z" className="fill-concrete stroke-concrete-edge" strokeWidth="1.5" />
        {filling && (
          <g>
            <rect x="70" y="34" width="9" height="8" rx="1.5" className="fill-kraft" />
            <rect x="82" y="38" width="10" height="9" rx="1.5" className="fill-kraft-deep" />
          </g>
        )}
        {/* 압축실 */}
        <rect x="20" y="52" width="150" height="62" rx="4" className="fill-concrete-top stroke-concrete-edge" strokeWidth="1.5" />
        <rect x="20" y="114" width="150" height="32" rx="3" className="fill-concrete-shade" />
        {/* 피스톤: 압축이면 밀었다 돌아온다 */}
        <g className={pressing ? 'anim-baler-press' : ''} style={{ '--press-travel': '46px' } as CSSProperties}>
          <rect x="8" y="78" width="30" height="10" rx="2" className="fill-ink-soft" />
          <rect x="34" y="58" width="12" height="50" rx="2" className="fill-accent" />
        </g>
        {/* 압축실 안의 파지 더미 */}
        <rect x={pressing || ejecting ? 96 : 60} y="66" width={pressing || ejecting ? 54 : 90} height="42" rx="3" className="fill-kraft-light" />
        {/* 결속·배출: 끈을 두른 베일이 배출구로 나간다 */}
        {ejecting && (
          <g className="anim-baler-eject" style={{ '--eject-travel': '40px' } as CSSProperties}>
            <rect x="132" y="70" width="40" height="36" rx="3" className="fill-kraft stroke-kraft-deep" strokeWidth="1.5" />
            <line x1="145" y1="70" x2="145" y2="106" className="stroke-ink" strokeWidth="2" />
            <line x1="159" y1="70" x2="159" y2="106" className="stroke-ink" strokeWidth="2" />
          </g>
        )}
      </svg>
      <svg aria-hidden="true" viewBox="186 14 124 136" preserveAspectRatio="xMidYMid meet" className="h-full min-h-0 w-full min-w-0 flex-[124_1_0%] md:flex-1">
        {/* 원형 게이지 */}
        <path d={arc(0, 1, GAUGE.r)} fill="none" className="stroke-paper-deep" strokeWidth="10" strokeLinecap="round" />
        {value !== null && value > 0 && <path d={arc(0, value, GAUGE.r)} fill="none" className="stroke-accent" strokeWidth="10" strokeLinecap="round" />}
        {ticks.map((t) => {
          const a = polar(t, GAUGE.r - 9);
          const b = polar(t, GAUGE.r - 14);
          return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-ink-faint" strokeWidth="1.2" />;
        })}
        {target !== null && (
          <g aria-hidden="true">
            <line
              x1={polar(target, GAUGE.r + 8).x}
              y1={polar(target, GAUGE.r + 8).y}
              x2={polar(target, GAUGE.r - 8).x}
              y2={polar(target, GAUGE.r - 8).y}
              className="stroke-ink"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
        )}
        <text x={GAUGE.x} y={GAUGE.y + 2} textAnchor="middle" className="fill-ink text-[19px] font-bold">
          {pressureMpa === null ? '–' : pressureMpa.toFixed(1)}
        </text>
        <text x={GAUGE.x} y={GAUGE.y + 16} textAnchor="middle" className="fill-ink-soft text-[10px]">
          {targetMpa === null ? 'MPa' : `MPa · 목표 ${targetMpa.toFixed(1)}`}
        </text>
        <text x={GAUGE.x} y={GAUGE.y + GAUGE.r + 12} textAnchor="middle" className="fill-ink-soft text-[11px] font-semibold">
          온도 {temperatureC === null ? '–' : formatTemperatureC(temperatureC)}
        </text>
      </svg>
    </div>
  );
}
