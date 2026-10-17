import type { Permission, Role } from '@ecocycle/shared';

export interface Account {
  id: string;
  name: string;
  role: Role;
  /** 모의 서버 전용 값(모두 1234). 실제 비밀번호가 아니고 실서버에는 영향이 없다. */
  password: string;
}

// 권한 매트릭스는 docs/decisions.md의 가정(3단계 위계)이다. 대표님 확정 후 고친다.
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ['batch.control', 'robot.control', 'robot.manual', 'settings.write', 'alarm.ack'],
  operator: ['robot.control', 'alarm.ack'],
  viewer: [],
};

export const ACCOUNTS: Account[] = [
  { id: 'admin', name: '관리자(모의)', role: 'admin', password: '1234' },
  { id: 'operator', name: '작업자(모의)', role: 'operator', password: '1234' },
  { id: 'viewer', name: '열람자(모의)', role: 'viewer', password: '1234' },
];
