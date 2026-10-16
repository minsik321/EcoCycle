import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vite.config';

// 실제 모의 서버(disconnect 시나리오)에 붙는 통합 테스트 전용 설정. scripts/integration.mjs가 서버를 띄운 뒤 실행한다.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['src/integration/**/*.integration.test.{ts,tsx}'],
      testTimeout: 150_000,
      // 한 모의 서버를 함께 쓴다. 로봇 통합 테스트가 로봇을 수동으로 바꾸는 동안 다른 파일(관절 값이 다시 흐르는지 보는 끊김 점검)이 겹치지 않게 차례로 돌린다
      fileParallelism: false,
      hookTimeout: 30_000,
    },
  }),
);
