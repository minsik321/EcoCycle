import type { ReactNode } from 'react';
import { useDeviceLive } from './live';

export interface NowNextProps {
  /** 공정 흐름에서 지금 하는 일. 서버 값(배치·차량·베일)으로만 만든다. 없으면 null */
  now: ReactNode | null;
  /** 다음에 올 일. 서버가 알려 준 계획이 없으면 null */
  next?: ReactNode | null;
}

function Row({ tag, children }: { tag: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-10 shrink-0 rounded-full bg-accent-soft py-0.5 text-center text-xs font-semibold text-accent-strong">{tag}</dt>
      <dd className="min-w-0 flex-1 text-base text-ink">{children}</dd>
    </div>
  );
}

/** 지금 / 다음: 공정 흐름 안에서 이 기기가 하는 일. 연결이 끊기면 둘 다 "–"이다. */
export function NowNext({ now, next = null }: NowNextProps) {
  const { disconnected } = useDeviceLive();
  return (
    <section aria-label="지금과 다음" className="rounded-card border border-line bg-surface p-4 shadow-soft-1">
      <dl className="flex flex-col gap-2">
        <Row tag="지금">{disconnected ? '–' : (now ?? '진행 중인 작업이 없습니다')}</Row>
        <Row tag="다음">{disconnected ? '–' : (next ?? '정해진 다음 작업이 없습니다')}</Row>
      </dl>
    </section>
  );
}
