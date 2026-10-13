import type { DeviceStatus } from '@ecocycle/shared';
import { useAppSelector } from '../../store/hooks';
import { selectIsDisconnected } from '../../store/selectors';

/**
 * 화면에 보일 상태. 연결이 끊겨 값이 갱신되지 않을 때는 마지막으로 받은 "정상" 같은 상태를 그대로 보여 주지 않고
 * 모두 "연결 끊김"으로 바꿔 표시한다 (마지막 값을 정상처럼 계속 보여 주지 않는다).
 */
export function useDisplayStatus(): { disconnected: boolean; show: (status: DeviceStatus) => DeviceStatus } {
  const disconnected = useAppSelector(selectIsDisconnected);
  return { disconnected, show: (status) => (disconnected ? 'offline' : status) };
}
