import { useId } from 'react';
import { Button } from '../common/Button';
import type { ButtonVariant } from '../common/Button';

export interface CommandButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** 비활성인 이유(권한 없음, 연결 끊김 등). 버튼 아래에 보여 준다. */
  reason?: string | null;
  /** 처리 중: 비활성화하고 중복 클릭을 막는다 */
  pending?: boolean;
  variant?: ButtonVariant;
}

/** 명령 하나를 보내는 버튼. 비활성이면 이유를 함께 보여 준다. 비활성은 편의일 뿐 차단은 서버가 한다. */
export function CommandButton({ label, onClick, disabled = false, reason, pending = false, variant = 'secondary' }: CommandButtonProps) {
  const reasonId = useId();
  const showReason = disabled && !!reason;
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        onClick={onClick}
        disabled={disabled}
        loading={pending}
        aria-describedby={showReason ? reasonId : undefined}
      >
        {pending ? `${label} 처리 중` : label}
      </Button>
      {showReason && (
        <span id={reasonId} className="text-xs text-slate-500">
          {reason}
        </span>
      )}
    </div>
  );
}
