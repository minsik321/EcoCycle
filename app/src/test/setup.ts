import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals를 쓰지 않으므로 화면 정리를 직접 등록한다
afterEach(() => {
  cleanup();
  // 화질 모드처럼 기기에 기억하는 값이 테스트끼리 새지 않게 한다
  localStorage.clear();
});
