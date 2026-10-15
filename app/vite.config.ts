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

/**
 * 3D 홈 미리 받기(studio/preload.ts)가 받을 조각 목록을 index.html의 <meta name="ecocycle-studio-files">에 적는다.
 * 패널 조각(studio/index.ts)과 3D 조각(studio/StudioScene.tsx), 그 둘이 정적으로 부르는 조각과 CSS 중 메인 묶음에 없는 것.
 * 파일 이름에 해시가 붙어 코드에서는 알 수 없으므로 빌드가 적는다. 받을지는 앱이 실행 중에 정한다(여기서는 받지 않는다).
 */
function studioFilesMeta(): Plugin {
  let base = '/';
  return {
    name: 'ecocycle-studio-files',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const chunks = Object.values(ctx.bundle ?? {}).filter((c) => c.type === 'chunk');
        const byName = new Map(chunks.map((c) => [c.fileName, c]));
        const walk = (start: string[], into: Set<string>, skip: Set<string> = new Set()) => {
          const queue = [...start];
          while (queue.length) {
            const name = queue.pop()!;
            if (into.has(name) || skip.has(name)) continue;
            into.add(name);
            queue.push(...(byName.get(name)?.imports ?? []));
          }
        };
        const main = new Set<string>();
        walk(chunks.filter((c) => c.isEntry).map((c) => c.fileName), main);
        const roots = chunks.filter((c) => /\/src\/studio\/(index\.ts|StudioScene\.tsx)$/.test((c.facadeModuleId ?? '').replace(/\\/g, '/')));
        const files = new Set<string>();
        walk(roots.map((c) => c.fileName), files, main);
        const css = [...files].flatMap((name) => [...(byName.get(name)?.viteMetadata?.importedCss ?? [])]);
        const urls = [...css, ...files].map((name) => base + name);
        return urls.length ? [{ tag: 'meta', attrs: { name: 'ecocycle-studio-files', content: urls.join(' ') }, injectTo: 'head' }] : [];
      },
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [dracoOnce(), react(), tailwindcss(), studioFilesMeta()],
  server: { host: true, port: 5173 },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['src/test/setup.ts'],
    // 실제 모의 서버가 필요하고 오래 걸리는 통합 테스트는 `npm run test:integration`으로 따로 돌린다
    exclude: process.env.ECOCYCLE_INTEGRATION ? configDefaults.exclude : [...configDefaults.exclude, '**/*.integration.test.{ts,tsx}'],
  },
});
