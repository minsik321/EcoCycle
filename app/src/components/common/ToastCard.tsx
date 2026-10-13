import type { ReactNode } from 'react';
import type { DeviceStatus } from '@ecocycle/shared';
import { Button } from './Button';

const EDGE: Record<DeviceStatus, string> = {
  normal: 'border-l-status-normal',
  caution: 'border-l-status-caution',
  alarm: 'border-l-status-alarm',
  offline: 'border-l-status-offline',
};

export interface ToastCardProps {
  /** 왼쪽 띠의 색 (뜻은 상태 색과 같다) */
  tone: DeviceStatus;
  title: ReactNode;
  children?: ReactNode;
  /** 주면 닫기 버튼을 보여 준다 */
  onDismiss?: () => void;
  /** 알람처럼 바로 알려야 하면 alert, 조작 결과처럼 덜 급하면 status */
  role?: 'status' | 'alert';
}

/** 화면 구석에 뜨는 알림 카드 한 장. 조작 결과와 알람이 같은 모양을 쓴다. */
export function ToastCard({ tone, title, children, onDismiss, role = 'status' }: ToastCardProps) {
  return (
    <div role={role} className={`glass pointer-events-auto flex items-start gap-3 rounded-card border-l-4 p-3 ${EDGE[tone]}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 font-semibold text-ink">{title}</div>
        {children && <div className="text-sm text-ink-soft">{children}</div>}
      </div>
      {onDismiss && (
        <Button variant="quiet" onClick={onDismiss} aria-label="알림 닫기" className="px-2">
          ✕
        </Button>
      )}
    </div>
  );
}
