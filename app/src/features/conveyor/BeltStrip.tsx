import type { CSSProperties } from 'react';

/** 그림에 올릴 덩어리 수의 상한 (그 이상은 숫자로 본다) */
const MAX_BLOCKS = 6;

export interface BeltStripProps {
  /** 서버 \`running\`. 멈췄으면 벨트·덩어리가 움직이지 않는다 */
  running: boolean;
  /** 서버 \`itemsToBaler\`. 받기 전이거나 끊기면 null(덩어리를 그리지 않는다) */
  items: number | null;
}

/**
 * 컨베이어 기기 페이지 맨 위 그림: 왼쪽 로봇팔 쪽에서 오른쪽 압축기로 가는 벨트 띠.
 * 가동 중이면 벨트 무늬가 흐르고, 압축기로 가는 덩어리(서버가 센 수, 최대 6개)가 벨트를 타고 간다.
 * 멈췄으면 그 자리에 서 있고, 끊기면 감싸는 DeviceHero가 data-frozen으로 움직임을 멈춘다.
 */
export function BeltStrip({ running, items }: BeltStripProps) {
  const count = items === null ? 0 : Math.min(items, MAX_BLOCKS);
  const label =
    items === null
      ? '컨베이어 그림'
      : `컨베이어 그림, ${running ? '가동 중' : '정지'}, 압축기로 가는 덩어리 ${items}개`;
  return (
    <div role="img" aria-label={label} className="flex h-full flex-col justify-center gap-2 px-3 py-4 md:gap-4 md:px-6">
      <div className="flex items-center justify-between text-xs font-semibold text-ink-soft">
        <span>로봇팔</span>
        <span>압축기 →</span>
      </div>
      <div className="flex items-center gap-2">
        {/* 벨트 */}
        <div className="relative h-14 min-w-0 flex-1 overflow-hidden rounded-full border-4 border-ink-soft bg-ink md:h-20">
          <div
            className={`absolute inset-0 opacity-40 ${running ? 'anim-belt-surface' : ''}`}
            style={{
              backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 14px, var(--color-ink-faint) 14px 16px)',
            }}
          />
          {Array.from({ length: count }, (_, i) => (
            <div
              key={i}
              data-testid="belt-item"
              className={`absolute inset-y-0 left-0 flex w-full items-center ${running ? 'anim-belt-carry' : ''}`}
              // 덩어리를 벨트 길이에 고르게 흩어 둔다 (멈춰 있을 때도 같은 자리)
              style={
                running
                  ? ({ animationDelay: `${(-7 * i) / count}s` } as CSSProperties)
                  : ({ transform: `translateX(${(100 * (i + 0.5)) / count}%)` } as CSSProperties)
              }
            >
              <span className="-ml-6 block h-7 w-9 rounded-sm border border-kraft-deep bg-kraft md:h-10 md:w-12" />
            </div>
          ))}
        </div>
        {/* 압축기 입구 */}
        <div className="h-20 w-10 shrink-0 rounded-control border-2 border-concrete-edge bg-concrete md:h-28 md:w-14" />
      </div>
    </div>
  );
}
