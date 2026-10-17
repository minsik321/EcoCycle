import { createContext, useContext } from 'react';
import { useAppSelector } from '../../store/hooks';
import { selectConnection } from '../../store/selectors';

/** 기기 페이지 조각들이 함께 보는 연결 상태. 끊기면 값은 "–", 그림은 멈춤, 마지막 수신 시각을 보여 준다. */
export interface DeviceLive {
  disconnected: boolean;
  /** 마지막 수신 시각 (ISO 8601 UTC) */
  lastReceivedAt: string | null;
}

const Override = createContext<DeviceLive | null>(null);

/** 연결 상태를 store 대신 직접 정한다. 서버 없이 보는 미리 보기(/design/device)에서만 쓴다. */
export const DeviceLiveOverride = Override.Provider;

export function useDeviceLive(): DeviceLive {
  const override = useContext(Override);
  const connection = useAppSelector(selectConnection);
  return override ?? { disconnected: connection.status === 'offline', lastReceivedAt: connection.lastReceivedAt };
}
