import type { DeviceStatus } from '@ecocycle/shared';
import { STATUS_SYMBOL, STATUS_TEXT } from '../../config/display';
import { TONE_CLASS } from './tone';

export interface StatusBadgeProps {
  status: DeviceStatus;
  /** 기본 문구(정상·주의·알람·연결 끊김) 대신 쓸 문구. 예: 로봇의 "작동 중" */
  label?: string;
  /** 기본 기호(✓ ▲ ✕ –) 대신 쓸 기호 */
  symbol?: string;
  /** lg: 기기 페이지 맨 위의 큰 상태 칩 */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** 상태를 색 + 기호 + 글자로 함께 보여 준다. 판정은 서버가 하고 여기서는 표시만 한다. */
export function StatusBadge({ status, label, symbol, size = 'md', className = '' }: StatusBadgeProps) {
  const text = label ?? STATUS_TEXT[status];
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : size === 'lg' ? 'shrink-0 px-3.5 py-1.5 text-base' : 'px-3 py-1 text-sm';
  return (
    <span
      data-status={status}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap ${sizeClass} ${TONE_CLASS[status]} ${className}`}
    >
      <span aria-hidden="true">{symbol ?? STATUS_SYMBOL[status]}</span>
      <span>{text}</span>
    </span>
  );
}
