import { getWsTicket } from '../api';
import { createRealtimeClient } from '../realtime';
import type { JointBuffer, RealtimeClient } from '../realtime';
import type { AppDispatch } from './index';
import { createStoreSink } from './realtimeSink';

// 실시간 연결은 앱 전체에 하나다. 화면마다 새로 열지 않는다.
// React 밖(3D 장면의 매 프레임 읽기 등)에서도 쓰므로 모듈 단위로 하나를 들고 있는다.

let client: RealtimeClient | null = null;
/** 관절 값이 필요한 화면(홈, 로봇 확대) 수. 1 이상이면 구독한다. */
let jointsUsers = 0;
let visible = true;

export function startRealtime(dispatch: AppDispatch): void {
  if (client) return;
  client = createRealtimeClient({ sink: createStoreSink(dispatch), getTicket: getWsTicket });
  client.setJointsWanted(jointsUsers > 0);
  client.setVisible(visible);
  client.start();
}

export function stopRealtime(): void {
  client?.stop();
  client = null;
}

/** 로봇 관절 값 구독을 요청한다. 돌려준 함수를 부르면 해제한다. 여러 화면이 동시에 요청해도 하나로 합친다. */
export function acquireJoints(): () => void {
  jointsUsers += 1;
  client?.setJointsWanted(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    jointsUsers -= 1;
    if (jointsUsers === 0) client?.setJointsWanted(false);
  };
}

export function setAppVisible(next: boolean): void {
  visible = next;
  client?.setVisible(next);
}

/** scene이 매 프레임 읽는 관절 값 버퍼. 연결 전에는 null */
export const getJointBuffer = (): JointBuffer | null => client?.jointBuffer ?? null;
