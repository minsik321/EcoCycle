import type { PushRegisterRequest } from '@ecocycle/shared';
import { request } from './http';

/** 안드로이드 기기의 FCM 토큰 등록. 서버가 FCM을 보내 줄 수 있을 때만 의미가 있다 (docs/questions.md B7). */
export const registerPush = (fcmToken: string): Promise<void> => {
  const body: PushRegisterRequest = { fcmToken, platform: 'android' };
  return request<void>('/push/register', { method: 'POST', body });
};

export const unregisterPush = (): Promise<void> => request<void>('/push/register', { method: 'DELETE' });
