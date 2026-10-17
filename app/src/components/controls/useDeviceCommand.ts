import { useCallback } from 'react';
import type { Command, DeviceId } from '@ecocycle/shared';
import { useAppDispatch } from '../../store/hooks';
import { sendDeviceCommand } from '../../store';

/**
 * 명령을 보내는 함수를 돌려준다. 컴포넌트는 api를 직접 부르지 않는다.
 * 결과(접수 → 완료·거부·실패)는 store의 commands에 쌓이고 CommandResultToast가 보여 준다.
 */
export function useDeviceCommand(): (deviceId: DeviceId, command: Command) => void {
  const dispatch = useAppDispatch();
  return useCallback(
    (deviceId, command) => {
      void dispatch(sendDeviceCommand({ deviceId, command }));
    },
    [dispatch],
  );
}
