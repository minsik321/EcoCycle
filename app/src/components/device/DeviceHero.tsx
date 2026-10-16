import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DeviceStatus } from '@ecocycle/shared';
import { StatusBadge } from '../status/StatusBadge';
import { Timestamp } from '../status/Timestamp';
import { useDeviceLive } from './live';

export interface DeviceHeroProps {
  name: string;
  /** 서버가 판정한 상태. 아직 받지 못했으면 null */
  status: DeviceStatus | null;
  /** 기본 문구(정상·주의…) 대신 쓸 문구. 예: 로봇의 "작동 중" */
  statusLabel?: string;
  /** "지금 하는 일" 한 줄. 서버 값으로 만든 문장만 넣는다. 모르면 null */
  activity: string | null;
  /** 기기 그림 (SVG·CSS 또는 작은 캔버스). 끊기면 이 영역의 CSS 움직임이 멈춘다. 정보가 없는 그림은 넣지 않는다(없으면 머리 줄만 그린다) */
  illustration?: ReactNode;
  /** 이 기기 값의 마지막 갱신 시각 */
  updatedAt?: string | null;
  /** 목록으로 돌아가는 링크 (탱크) */
  back?: { to: string; label: string };
  /** 상태 칩 앞에 붙는 작은 칩들 (섹터: 수분·등급). 좁으면 이름 아래 줄로 내려간다 */
  chips?: ReactNode;
}

/**
 * 기기 페이지 맨 위: 이름, (있으면) 작은 칩과 큰 상태 칩, 지금 하는 일 한 줄, (있으면) 기기 그림.
 * 그림 칸은 카드의 남는 높이를 채워, 카드가 옆 칸(섹터 PC의 자세히)에 맞춰 늘어날 때 빈 곳이 아래에 몰리지 않는다.
 * 연결이 끊기면 상태는 "연결 끊김", 하는 일은 "–"로 바꾸고 마지막 수신 시각을 보여 주며 그림을 멈춘다.
 */
export function DeviceHero({ name, status, statusLabel, activity, illustration, updatedAt, back, chips }: DeviceHeroProps) {
  const { disconnected, lastReceivedAt } = useDeviceLive();
  return (
    <section aria-label={`${name} 상태`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 shadow-soft-1">
      <div className="flex flex-wrap items-start gap-2">
        {back && (
          <Link
            to={back.to}
            aria-label={back.label}
            className="-my-1 -ml-2 inline-flex h-12 w-10 shrink-0 items-center justify-center rounded-control text-ink-soft active:bg-paper-deep"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
        )}
        {/* 이름은 줄지 않는다: 칩이 모자라면 칩 묶음이 다음 줄(오른쪽)로 내려간다 */}
        <h1 className="min-w-0 flex-[1_0_auto] self-center text-xl leading-tight font-bold text-ink">{name}</h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {chips}
          {disconnected ? (
            <StatusBadge status="offline" size="lg" />
          ) : (
            status && <StatusBadge status={status} label={statusLabel} size="lg" />
          )}
        </div>
      </div>
      {/* 하는 일은 상태 칩 옆이 아니라 폭 전체로: 좁은 칸에서 짧은 문장이 두 줄로 꺾이지 않게 */}
      <p aria-label="지금 하는 일" className="-mt-2 text-base text-ink-soft">
        {disconnected ? '–' : (activity ?? '불러오는 중…')}
      </p>

      {illustration && (
        <div
          data-frozen={disconnected ? 'true' : undefined}
          className={`relative min-h-40 flex-1 overflow-hidden rounded-card bg-paper md:min-h-72 ${disconnected ? 'opacity-60 grayscale' : ''}`}
        >
          {illustration}
        </div>
      )}

      <p className="text-xs text-ink-faint">
        {disconnected ? (
          <>
            연결 끊김 · 마지막 수신 <Timestamp iso={lastReceivedAt} />
          </>
        ) : (
          <>
            마지막 갱신 <Timestamp iso={updatedAt} />
          </>
        )}
      </p>
    </section>
  );
}
