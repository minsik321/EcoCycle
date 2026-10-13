import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals를 쓰지 않으므로 화면 정리를 직접 등록한다.
// (node 환경에서 도는 테스트에는 화면과 localStorage가 없다)
afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
  // 화질 모드처럼 기기에 기억하는 값이 테스트끼리 새지 않게 한다
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
