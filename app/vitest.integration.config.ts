import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vite.config';

// 실제 모의 서버(disconnect 시나리오)에 붙는 통합 테스트 전용 설정. scripts/integration.mjs가 서버를 띄운 뒤 실행한다.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['src/integration/**/*.integration.test.{ts,tsx}'],
      testTimeout: 150_000,
      hookTimeout: 30_000,
    },
  }),
);
