/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173 },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['src/test/setup.ts'],
    // 실제 모의 서버가 필요하고 오래 걸리는 통합 테스트는 `npm run test:integration`으로 따로 돌린다
    exclude: process.env.ECOCYCLE_INTEGRATION ? configDefaults.exclude : [...configDefaults.exclude, '**/*.integration.test.tsx'],
  },
});
