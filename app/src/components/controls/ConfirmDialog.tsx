import type { ReactNode } from 'react';
import { Button } from '../common/Button';
import { Dialog } from '../common/Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 처리 중: 확인 버튼을 막고 닫히지 않게 한다 */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * 대화상자에 더 넣을 것. 위험도 높은 명령의 재인증(비밀번호·PIN) 입력이 들어갈 자리다.
   * 재인증 방식은 서버와 확정되면 정한다.
   */
  children?: ReactNode;
}

/**
 * 위험도 높은 명령(수동 모드 전환, 탱크 지정 집기, 설정 변경)을 보내기 전에 거치는 확인 단계.
 * 실수로 눌러도 바로 실행되지 않도록 처음 초점은 "취소"에 둔다.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  pending = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      dismissible={!pending}
      actions={
        <>
          <Button data-autofocus onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
      {children}
    </Dialog>
  );
}
