/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * three의 DRACOLoader는 Draco 디코더 두 벌(일반용·glTF용)과 asm.js 예비본을 new URL로 가리켜, 빌드에 디코더가 두 벌 나온다.
 * 스튜디오는 glTF만 읽으므로 모두 glTF용 한 벌(wasm + 감싸개)을 가리키게 바꾼다 (studio/models.ts).
 */
function dracoOnce(): Plugin {
  return {
    name: 'ecocycle-draco-once',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/examples/jsm/loaders/DRACOLoader.js')) return null;
      return code
        .replace("'../libs/draco/draco_decoder.wasm'", "'../libs/draco/gltf/draco_decoder.wasm'")
        .replace("'../libs/draco/draco_wasm_wrapper.js'", "'../libs/draco/gltf/draco_wasm_wrapper.js'")
        .replace("'../libs/draco/draco_decoder.js'", "'../libs/draco/gltf/draco_wasm_wrapper.js'");
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [dracoOnce(), react(), tailwindcss()],
  server: { host: true, port: 5173 },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['src/test/setup.ts'],
    // 실제 모의 서버가 필요하고 오래 걸리는 통합 테스트는 `npm run test:integration`으로 따로 돌린다
    exclude: process.env.ECOCYCLE_INTEGRATION ? configDefaults.exclude : [...configDefaults.exclude, '**/*.integration.test.{ts,tsx}'],
  },
});
